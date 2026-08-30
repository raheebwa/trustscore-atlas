# Security policy

## What is supported

Atlas is before its first tagged release. Security fixes are made on `main`, and once tags exist,
on the latest tag. Older commits are not patched.

## Reporting a vulnerability

Please report privately, through GitHub's private vulnerability reporting on this repository:
open the **Security** tab and choose **Report a vulnerability**. That keeps the report and the
discussion out of public view until a fix is available.

If you cannot use that, write to hello@badrama.com with enough detail to reproduce the issue.

Please do not open a public issue for a suspected vulnerability, and please do not test against the
live site in a way that would affect other readers: no denial of service, no bulk automated
scanning, and no attempt to reach another person's claim, correction, or uploaded document.

## What to expect

- An acknowledgement within **5 business days**.
- An assessment of severity and, where the report is accepted, a fix or a mitigation plan.
- Credit in the release notes if you would like it, or none if you would rather not be named.

## What is in scope

The deployed application, the HTTP API, the maintainer surface, the data pipeline in this
repository, and the workflows that run it. In particular:

- Anything that would let one person read or act on another person's claim, correction, evidence
  document, or verification link.
- Anything that would let a claim, correction, or approval change published data without passing
  the verification and approval rules the code describes.
- Anything that would publish personal data the pipeline is meant to exclude.

## What is out of scope

- The public registers themselves and their publishers' websites.
- Reports produced only by a scanner, with no demonstrated impact.
- Missing hardening headers or configuration with no path to an actual effect on a reader or
  their data. These are still welcome as ordinary issues.
