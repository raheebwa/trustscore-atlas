# Atlas pipeline

Python 3.13 framework that runs source adapters, applies statement mappings, checks
adapter conformance, resolves statements into canonical records, evaluates rubrics, and
loads the serving database. Runs unchanged on a developer machine and inside the pipeline
container (`infra/Dockerfile.pipeline`).

```sh
uv sync            # install
uv run pytest      # tests with coverage
uv run ruff check  # lint
```
