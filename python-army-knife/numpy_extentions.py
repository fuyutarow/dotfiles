def normalized_data(xs, us, ys):
    return (np.swapaxes(xs / 255., 1, 3).astype(np.float32),
            maxmin_normalize(us).astype(np.float32), ys.astype(np.int8))


def dot_array(*args, xp=np):
    """convert to xp.array from each arg"""
    return tuple(xp.array(arg) for arg in args)


def dot_variable(*args):
    """convert to chainer.Variable from each arg"""
    return tuple(chainer.Variable(arg) for arg in args)


def chunk_array(array, batchsize=2):
    """get n-batch cyclicaly from Array(batchsize, data)"""
    index = idx = 0
    bs = batchsize
    while True:
        end = idx + bs
        yield np.take(array, range(idx, end), axis=0, mode='wrap')
        idx = end


def get_batch(*arrays, batchsize=None):
    """apply each arg to cunck_array"""
    batchsize = batchsize if batchsize else len(arrays[0])
    gs = [chunk_array(arr, batchsize) for arr in arrays]
    while True:
        yield tuple([next(g) for g in gs])


def augment(xs, us, ys, p=None, batchsize=None):
    """execute data augmentaion"""
    batchsize = batchsize if batchsize else len(xs[0])
    g = p.keras_generator_from_array(xs, ys, batchsize)
    xs, ys = next(g)
    return (xs, us, ys)


def shuffled(*args):
    """shuffle list of arg with same order"""
    batch = list(zip(*args))
    random.shuffle(batch)
    return zip(*batch)
