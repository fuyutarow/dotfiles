from pathlib import Path

import struct

import numpy as np
from PIL import Image

from jis2uni import from_jis0208
sz_record = 8199


def read_record_ETL8G(f):
    s = f.read(sz_record)
    r = struct.unpack('>2H8sI4B4H2B30x8128s11x', s)
    iF = Image.frombytes('F', (128, 127), r[14], 'bit', 4)
    iL = iF.convert('L')
    return r + (iL, )


def read_ELT8G():
    # Character type = 956, person = 160, y = 127, x = 128
    ary = np.zeros([956, 160, 127, 128], dtype=np.uint8)

    save_dir = Path('ELT8G_PNG')

    chars = set()
    for j in range(1, 33):
        filename = f'ETL/ETL8G/ETL8G_{j:02d}'
        with open(filename, 'rb') as f:
            for id_dataset in range(5):
                for i in range(956):
                    r = read_record_ETL8G(f)
                    SSN, JISX0208, ASCII, SDN, EIC, ECG, MaleFemale, Age, IC, OC, SGDate, SDate, ScanningDate, X, Y, img = r
                    person = (j - 1) * 5 + id_dataset
                    char = from_jis0208(JISX0208)
                    img_rbg = Image.fromarray(
                        np.array(img) * 255).convert('RGB')

                    if not char in chars:
                        (save_dir / char).mkdir(parents=True)
                        chars.add(char)
                    img_rbg.save(save_dir / char / f'{person}.png', 'png')


if __name__ == '__main__':
    read_ELT8G()
