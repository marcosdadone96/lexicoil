#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/.venv-pos-check"

python3 -m venv "$VENV"
# shellcheck disable=SC1091
source "$VENV/bin/activate"
pip install --upgrade pip spacy click
python -m pip install https://github.com/explosion/spacy-models/releases/download/de_core_news_sm-3.8.0/de_core_news_sm-3.8.0-py3-none-any.whl

echo ""
echo "POS checker ready. Activate with:"
echo "  source $VENV/bin/activate"
echo "Or set POS_CHECK_PYTHON=$VENV/bin/python"
