"""Inspect torch.save tensor metadata in a short-lived CPU-only process."""
import json
import os
import sys
from collections.abc import Mapping
from itertools import islice


class PreviewError(Exception):
    pass


def tensor_rows(root, torch):
    active = set()
    visits = 0

    def walk(value, name="", depth=0):
        nonlocal visits
        visits += 1
        if visits > 500_000 or depth > 100 or len(name) > 4096:
            raise PreviewError("检查点结构过大，无法生成参数预览。")
        if isinstance(value, torch.Tensor):
            yield {"name": name or "(根张量)", "shape": list(value.shape),
                   "dtype": str(value.dtype).removeprefix("torch."), "elements": str(value.numel())}
            return
        if not isinstance(value, (Mapping, list, tuple)) or id(value) in active:
            return
        active.add(id(value))
        try:
            if isinstance(value, Mapping):
                for key, child in value.items():
                    if isinstance(key, (str, int)):
                        yield from walk(child, f"{name}.{key}" if name else str(key), depth + 1)
            else:
                for index, child in enumerate(value):
                    yield from walk(child, f"{name}[{index}]", depth + 1)
        finally:
            active.remove(id(value))

    limit = 10000
    rows = list(islice(walk(root), limit + 1))
    return {"rows": rows[:limit], "truncated": len(rows) > limit}


def inspect(path):
    try:
        import torch
    except ImportError:
        raise PreviewError("服务器需要安装 PyTorch。请用 CHECKPOINT_PYTHON 指定已安装 PyTorch 的 Python 环境。")
    if tuple(int(n) for n in torch.__version__.split(".")[:2]) < (2, 6):
        raise PreviewError("预览检查点需要 PyTorch 2.6 或更高版本。")
    from torch._subclasses.fake_tensor import FakeTensorMode

    with FakeTensorMode():
        # Limit additional address space used while parsing untrusted metadata on Linux.
        if sys.platform == "linux":
            import resource
            with open("/proc/self/statm", encoding="ascii") as stat:
                virtual_bytes = int(stat.read().split()[0]) * os.sysconf("SC_PAGE_SIZE")
            soft, hard = resource.getrlimit(resource.RLIMIT_AS)
            cap = virtual_bytes + 1024 ** 3
            for existing in (soft, hard):
                if existing != resource.RLIM_INFINITY:
                    cap = min(cap, existing)
            resource.setrlimit(resource.RLIMIT_AS, (cap, hard))
        obj = torch.load(path, map_location="cpu", weights_only=True)
        return tensor_rows(obj, torch)


if __name__ == "__main__":
    try:
        result = inspect(sys.argv[1])
    except PreviewError as error:
        result = {"error": str(error)}
    except Exception:
        result = {"error": "无法读取该检查点。支持 torch.save 保存的张量或权重字典；完整模型、自定义对象和损坏的文件可能无法预览。"}
    print(json.dumps(result, ensure_ascii=True, separators=(",", ":")))
