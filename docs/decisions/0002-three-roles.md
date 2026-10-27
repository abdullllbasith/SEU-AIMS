# 0002 — Three application roles only

## Status

Accepted (master rules + authentication module).

## Decision

Application roles are `STUDENT`, `LECTURER`, `DEPARTMENT_ADMINISTRATOR`. No HOD, super-admin, or parent role in the product.

The HOD participates in CA Recovery by **physical signature**. Administrators record verification. There is no HOD dashboard.

## Consequences

Authorization matrices and UI routes stay on these three roles. Study Room ordinary APIs require `STUDENT`.
