shift_jis = []
jisx0208 = []
unicode = []
with open("JIS0208.TXT", "r") as f:
    for line in f:
        if line[0] == "#":
            pass
        else:
            sjis, jisx, unic, _ = line.strip().split("\t")
            shift_jis.append(int(sjis, 16))
            jisx0208.append(int(jisx, 16))
            unicode.append(int(unic, 16))


def jis2uni(n):
    return unicode[jisx0208.index(n)]


def from_jis0208(n):
    return chr(unicode[jisx0208.index(n)])
