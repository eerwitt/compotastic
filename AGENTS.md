# Repository Guidelines

## Build & Packaging

- Always create isolated Python environments targeting **Python 3.12** before installing dependencies.
- Install runtime and build dependencies for the backend with `pip install -r requirements.txt`.

## Testing

- Run the unit test suite from the `backend` directory with `python -m unittest discover -s tests -p "test_*.py"`.
- Add new tests alongside implementation changes whenever possible to keep coverage healthy.
- Tests may import helpers from `simulation.logic` to validate simulation logic.

## Code Quality

- Follow the existing logging callbacks when reporting status or errors.
- Avoid introducing new third-party dependencies unless they are already declared in `requirements.txt`.
