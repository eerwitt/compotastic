# Repository Guidelines

## Build & Packaging
- Always create isolated Python environments targeting **Python 3.11** before installing dependencies.
- Install runtime and build dependencies with `pip install -r requirements.txt`.
- Use the non-interactive pygbag build pipeline to generate browser artifacts: `python -m pygbag --build simulation`. Do **not** run `pygbag simulation` directly because it blocks on the interactive deploy step.
- When packaging for distribution, prefer `python -m build` after ensuring the virtual environment is active.

## Testing
- Run the unit test suite with `python -m unittest discover -s tests -p "test_*.py"`.
- Add new tests alongside implementation changes whenever possible to keep coverage healthy.
- Tests may import helpers from `simulation.logic` to validate simulation logic.

## Code Quality
- Follow the existing logging callbacks when reporting status or errors.
- Avoid introducing new third-party dependencies unless they are already declared in `requirements.txt`.
- Keep the codebase compatible with Unity's Python embedding constraints.
