import os
import shutil
import math
import pandas as pd
import json
import numpy as np
from functools import reduce

root_dir = '/usr/local/share/data/regimen/'
regimen_dir = '/usr/local/share/data/regimen/data/dataset'

n_data = 4988  # len(os.listdir(regimen_dir))


def path_join(*args):
    return reduce(lambda a, b: a + '/' + b, args).replace('//', '/')


def load_summary(limit=-1):
    regimens = pd.read_csv(
        'summary_files.csv',
        names=['index', 'pharma_file', 'method_file'],
        index_col='index')
    regimens['pharma_path'] = path_join(root_dir, 'data/dataset',
                                        regimens['pharma_file'])
    regimens['method_path'] = path_join(root_dir, 'data/dataset_regimen',
                                        regimens['method_file'])
    return regimens


regimens = load_summary()


def chunk_array(array, batchsize=2, axis=0, mode='wrap'):
    """get n-batch cyclicaly from Array(batchsize, data)"""
    index = idx = 0
    bs = batchsize
    while True:
        end = idx + bs
        yield np.take(array, range(idx, end), axis=axis, mode=mode)
        idx = end


def load_tsv(filepath):
    df = pd.read_csv(
        filepath,
        delimiter='\t',
        index_col='TIMESERIES',
    ).T.fillna(0)
    #df['datetime'] = pd.to_datetime(df.index)
    #df = df.set_index(['datetime'])
    return df


pharma_df = pd.read_csv(
    os.path.join(root_dir, 'chusha.csv'),
    names=['code', 'name', 'anti-cancer-flag'],
    encoding='shift-jis')

pharma_code2id = {
    code: idx
    for idx, code in enumerate(pharma_df['code'].values)
}

pharma_size = len(pharma_code2id)

method_df = pd.read_csv(
    os.path.join(root_dir, 'regimen.tsv'),
    delimiter='\t',
    names=['index', 'method', 'n_record', 'n_patient'],
    index_col='index',
)

method_code2id = {
    code: idx
    for idx, code in enumerate(method_df['method'].values)
}

method_size = len(method_code2id)


def load_fromdf_pharma(df):
    a = np.zeros((pharma_size, len(df)))
    for pharma_code_ in df.columns:
        pharma_code = pharma_code_.strip()
        a[pharma_code2id[pharma_code]] = df[pharma_code_].values
    return a


def load_pharma_by_i(i):
    df = load_tsv(regimens.iloc[i]['pharma_path'])
    x = load_fromdf_pharma(df)
    return x


def df_pharma_by_i(i):
    df = load_tsv(regimens.iloc[i]['pharma_path'])
    return df


def load_fromdf_method(df):
    a = np.zeros((method_size, len(df)))
    for method_code_ in df.columns:
        method_code = method_code_.strip()
        a[method_code2id[method_code]] = df[method_code_].values
    return a


def load_method_by_i(i):
    df = load_tsv(regimens.iloc[i]['method_path'])
    x = load_fromdf_method(df)
    return x


def df_method_by_i(i):
    df = load_tsv(regimens.iloc[i]['method_path'])
    return df

class G:
    def __init__(self):
        self.g = cycle(load_pharma_by_i(i) for i in range(1, 5))
        self.init_h()
        
    def init_h(self):
        data = self.next_g()
        self.h = chunk_array(data, 10, axis=1, mode='raise')
    
    def __call__(self):
        try:
            return self.next_h()
        except:
            self.init_h()
            return self.next_h()
        
    def next_h(self):
        return next(self.h)
    
    def next_g(self):
        return next(self.g)
