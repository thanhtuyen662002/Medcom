#!/usr/bin/env python3
"""Fully verify an archive member before admitting SQL bytes to source analysis."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile
import zipfile
import zlib

APPROVED_ARCHIVE_SHA256='6a74eb02dc747e9c6ab679f69ca515783a8724ad767f6702fcebd28f195b1144'
APPROVED_MEMBER='MedData-Data.sql'
APPROVED_MEMBER_BYTES=1212595716


def digest_file(path):
    digest=hashlib.sha256()
    with Path(path).open('rb') as source:
        for block in iter(lambda:source.read(8*1024*1024),b''):digest.update(block)
    return digest.hexdigest()


def extract_verified(archive, destination, *, expected_archive_sha256, expected_member, expected_bytes):
    archive=Path(archive);destination=Path(destination)
    if digest_file(archive)!=expected_archive_sha256:raise ValueError('Archive hash mismatch')
    temporary=None
    try:
        with zipfile.ZipFile(archive) as container:
            members=container.infolist()
            if len(members)!=1 or members[0].filename!=expected_member:raise ValueError('Unexpected archive members')
            member=members[0]
            if member.file_size!=expected_bytes:raise ValueError('Unexpected member size')
            destination.parent.mkdir(parents=True,exist_ok=True)
            size=0;checksum=0;digest=hashlib.sha256()
            # Same-directory atomic replacement: interrupted/failed extraction never replaces a verified file.
            with tempfile.NamedTemporaryFile(dir=destination.parent,prefix='.verified-',delete=False) as output:
                temporary=Path(output.name)
                with container.open(member) as source:
                    for block in iter(lambda:source.read(8*1024*1024),b''):
                        size+=len(block)
                        if size>expected_bytes:raise ValueError('Oversized archive member')
                        output.write(block);digest.update(block);checksum=zlib.crc32(block,checksum)
                output.flush();os.fsync(output.fileno())
            if size!=member.file_size or checksum!=member.CRC:raise ValueError('Incomplete or corrupt archive member')
            temporary.replace(destination);temporary=None
            return {'size':size,'sha256':digest.hexdigest(),'encoding':'UTF-16LE BOM',
                    'archiveMember':member.filename,'crc32':format(checksum,'08x'),
                    'archiveMemberIntegrity':'VERIFIED_FULL_SIZE_AND_CRC'}
    finally:
        if temporary is not None:temporary.unlink(missing_ok=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('archive');parser.add_argument('destination')
    args=parser.parse_args();destination=Path(args.destination).resolve()
    if destination.is_relative_to(Path(__file__).resolve().parents[2]):
        raise SystemExit('Private SQL must stay outside the public checkout')
    result=extract_verified(args.archive,destination,expected_archive_sha256=APPROVED_ARCHIVE_SHA256,
                            expected_member=APPROVED_MEMBER,expected_bytes=APPROVED_MEMBER_BYTES)
    print(json.dumps(result,sort_keys=True))
