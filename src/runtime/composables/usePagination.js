import { computed, ref, unref, watch } from '#imports';

export function usePagination(options = {}) {
  const { totalItems = 0, itemsPerPage = 20, currentPage = 1, cntBtns = 7, onChange = null, controlled = false } = options;

  const cntPages = computed(() => {
    return Math.ceil(unref(totalItems) / unref(itemsPerPage));
  });

  const currP = ref(1);

  const normalizePage = () => {
    const total = cntPages.value;
    const page = unref(currentPage);

    // Restoring a URL must not clamp the requested page against stale/loading totals.
    if (controlled) return Math.max(1, page);

    if (page <= 0 || total === 0) return 1;
    if (page > total) return total;

    return page;
  };

  currP.value = normalizePage();

  const pageButtons = computed(() => {
    const total = cntPages.value;
    const current = currP.value;
    const maxBtns = unref(cntBtns);

    let arr = [1];

    if (total <= maxBtns) {
      while (arr.length < total) arr.push(arr[arr.length - 1] + 1);
      return arr;
    }

    if (current < maxBtns - 2) {
      while (arr.length < maxBtns - 2) arr.push(arr[arr.length - 1] + 1);

      arr.push(0);
      arr.push(total);
      return arr;
    }

    if (current > total - maxBtns + 3) {
      arr.push(0);
      for (let i = 1; i < maxBtns - 1; i++) {
        arr.push(total - maxBtns + 2 + i);
      }
      return arr;
    }

    let ceil = Math.ceil((maxBtns - 7) / 2);
    let tmp = [ceil, maxBtns - 7 - ceil];

    if (current > total / 2) tmp = tmp.reverse();

    for (let i = 1; i <= tmp[0]; i++) {
      arr.push(arr[arr.length - 1] + 1);
    }

    arr.push(0);

    for (let i = -1; i <= 1; i++) {
      arr.push(current + i);
    }

    arr.push(0);

    for (let i = 0; i < tmp[1]; i++) {
      arr.push(total - tmp[1] + i);
    }

    arr.push(total);

    return arr;
  });

  const changePage = (page) => {
    if (!page) return false;
    if (controlled) {
      if (page !== unref(currentPage) && onChange) onChange(page);
      return;
    }
    currP.value = page;
  };

  const incDecPage = (offset = 1) => {
    const next = currP.value + offset;
    if (next > cntPages.value || next < 1) return false;

    changePage(next);
  };

  watch(
    () => unref(currentPage),
    () => {
      currP.value = normalizePage();
    },
  );

  watch(currP, (val) => {
    if (!controlled && onChange) onChange(val);
  });

  return {
    currP,
    cntPages,
    pageButtons,
    changePage,
    incDecPage,
  };
}
