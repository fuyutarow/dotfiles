#!/usr/bin/env python
"""
./unix-style-script.py  'hello, world!'
echo 'hello, world!' | ./unix-style-script.py
"""

import sys
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('standard_input', nargs='?')
args = parser.parse_args()

if args.standard_input:
    standard_input = args.standard_input
elif not sys.stdin.isatty():
    standard_input = sys.stdin.read()
else:
    parser.print_help()

print(standard_input)
