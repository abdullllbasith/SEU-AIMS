# Security tests

This directory will hold authorization and isolation tests, including:

- student cannot read another student's results
- lecturer cannot manage an unassigned subject offering
- lecturer cannot access Study Room
- student cannot perform administrator operations

Those cases require authentication and domain data from later prompts. The current tests only assert fail-closed auth stubs and untrusted-file defaults.
