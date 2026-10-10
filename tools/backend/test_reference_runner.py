import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


RUNNER = Path(__file__).with_name('run_reference_check.py')


class ReferenceRunnerTests(unittest.TestCase):
    def invoke(self, source, *arguments):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'reference.py'
            path.write_text(source, encoding='utf-8')
            return subprocess.run([sys.executable, '-X', 'utf8', str(RUNNER), str(path), *arguments],
                                  capture_output=True, text=True, encoding='utf-8')

    def test_direct_python_children_keep_unicode_argument_bytes_cwd_and_stream_capture(self):
        source = """import json,pathlib,subprocess,sys,tempfile
with tempfile.TemporaryDirectory() as folder:
 child=pathlib.Path(folder)/'child.py'
 child.write_text('import json,pathlib,sys; print(json.dumps([sys.argv[1:],str(pathlib.Path.cwd())]))',encoding='utf-8')
 result=subprocess.run([str(child),*sys.argv[1:]],cwd=folder,capture_output=True,text=True,encoding='utf-8',check=True)
 arguments,directory=json.loads(result.stdout)
 assert pathlib.Path(directory)==pathlib.Path(folder)
 print(json.dumps(arguments,ensure_ascii=False))
"""
        arguments = ('Tiếng Việt', 'literal $() & ;', 'value with spaces', '')
        result = self.invoke(source, *arguments)
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(list(arguments), json.loads(result.stdout))

    def test_child_nonzero_exit_and_stderr_remain_observable(self):
        result = self.invoke("""import pathlib,subprocess,tempfile
with tempfile.TemporaryDirectory() as folder:
 child=pathlib.Path(folder)/'child.py';child.write_text('import sys; print("rejected",file=sys.stderr);sys.exit(7)',encoding='utf-8')
 result=subprocess.run([str(child)],capture_output=True,text=True)
 assert result.returncode==7 and result.stderr.strip()=='rejected'
 try: subprocess.run([str(child)],capture_output=True,check=True)
 except subprocess.CalledProcessError as error: assert error.returncode==7
 else: raise AssertionError('Nonzero exit hidden')
""")
        self.assertEqual(0, result.returncode, result.stderr)

    def test_already_explicit_python_missing_scripts_and_timeouts_keep_failure_semantics(self):
        result = self.invoke("""import subprocess,sys,tempfile,pathlib
assert subprocess.check_output([sys.executable,'-c','print("explicit")'],text=True).strip()=='explicit'
with tempfile.TemporaryDirectory() as folder:
 try: subprocess.run([str(pathlib.Path(folder)/'absent.py')],capture_output=True)
 except FileNotFoundError: pass
 else: raise AssertionError('Missing executable failure hidden')
 child=pathlib.Path(folder)/'slow.py';child.write_text('import time;time.sleep(10)',encoding='utf-8')
 try: subprocess.run([str(child)],timeout=0.1,capture_output=True)
 except subprocess.TimeoutExpired: pass
 else: raise AssertionError('Timeout hidden')
""")
        self.assertEqual(0, result.returncode, result.stderr)


if __name__ == '__main__':
    unittest.main()
