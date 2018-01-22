def sort_by_frequency(df_col, top=-1):
    return df_col.value_counts().reset_index()


def unique_value_counts(df):
    res = {}
    for col in df.columns:
        c = df[col].value_counts().count()
        res[col] = c
    return res
