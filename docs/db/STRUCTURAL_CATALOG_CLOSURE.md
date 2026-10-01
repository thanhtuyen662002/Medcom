# Structural catalog closure

VERIFIED against authoritative Medcom-Data.sql, baseline SHA-256 2d809c2e0d4c80700a1e8946c8f09db45a5840ec6735413bd46c3bd1d1ee1e0c. Sanitized DDL metadata only.

A full streaming parse finds 583 permanent dbo tables and 7,985 column declarations, superseding the earlier provisional 7,968 count. Nullability is 5,610 nullable and 2,375 NOT NULL.

Top declared types: varchar 2,964; nvarchar 1,887; decimal 1,049; datetime 725; bit 687; int 435; float 83; uniqueidentifier 30; image 27; datetime2 27.

Exactly 17 columns declare IDENTITY. The dump also declares dbo.Seq_UnitID and dbo.UserAutoIDSeq; runtime consumers remain UNKNOWN.

Constraint/index coverage: 533 tables declare a PRIMARY KEY and 50 are keyless; 364 FOREIGN KEY, 812 DEFAULT, 558 CHECK and 7 UNIQUE ALTER TABLE declarations; 125 explicit CREATE INDEX declarations across 79 tables. Explicit index count excludes indexes implicitly created by PK/UNIQUE constraints.

Web disposition: preserve existing keys, constraints, defaults, identity and sequence behavior as compatibility baseline unless a controlled schema change is separately evidenced. Do not invent business keys for keyless tables. Runtime plans, cardinality, fragmentation and sequence consumers are UNKNOWN pending runtime/C# evidence.
