import os
import shutil

import argparse
parser = argparse.ArgumentParser(description='count files')
parser.add_argument('dir', default='.')
parser.add_argument('-r', dest='recursive', action='store_true')
parser.add_argument('-d', dest='onlydir', action='store_true')
parser.add_argument('-f', dest='onlyfile', action='store_true')
args = parser.parse_args()

if args.recursive:
    for dir in os.listdir(args.dir):
        if os.path.isdir(dir):
            res = len(os.listdir(dir))
            print('{}\t{}'.format(dir, res))

if __name__ == '__main__':

    res = len(os.listdir(args.dir))
    print('{}\t{}'.format('.', res))
