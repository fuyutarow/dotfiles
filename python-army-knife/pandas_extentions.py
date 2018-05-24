def sort_by_frequency(df_col, top=-1):
    return df_col.value_counts().reset_index()


def unique_value_counts(df):
    res = {}
    for col in df.columns:
        c = df[col].value_counts().count()
        res[col] = c
    return res


def palse_plot(dataframe, columns=None):
    columns = columns if not columns is None else dataframe.columns
    df = pd.DataFrame(columns=columns)
    for i, column in enumerate(columns):
        df[column] = dataframe[column] * 0.9 + i
    print(columns)
    df[columns].plot()


self.teaching_df_raw.set_index('外注ID')['外注名'].to_dict()
