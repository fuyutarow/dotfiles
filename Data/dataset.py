# coding: utf-8

# In[1]:

from sklearn import datasets
import pandas as pd

# In[2]:

boston = datasets.load_boston()
iris = datasets.load_iris()

dataset = boston
df = pd.DataFrame(dataset['data'], columns=dataset['feature_names'])
df['target'] = dataset['target']
df.to_csv('boston.csv')
n = len(df) // 10
df.iloc[:n].to_csv('boston/test.csv')
df.iloc[n:].to_csv('boston/train.csv')

dataset = iris
df = pd.DataFrame(dataset['data'], columns=dataset['feature_names'])
df['target'] = dataset['target']
df.to_csv('iris.csv')
n = len(df) // 10
df.iloc[:n].to_csv('iris/test.csv')
df.iloc[n:].to_csv('iris/train.csv')
