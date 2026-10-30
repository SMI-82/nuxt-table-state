import { reactive, ref } from '#imports';

export function useOrder(fields, defField = 'id') {
  const domRefs = {};
  const orderRefs = {};

  fields.forEach((key) => {
    domRefs[key] = ref(null);
    orderRefs[key] = domRefs[key];
  });

  const orderFields = reactive(orderRefs);

  function order(val) {
    for (const key in orderFields) {
      if (key !== val.key) {
        let comp = orderFields[key];
        if (comp?.reset) comp.reset();
      }
    }
    return {
      key: val.key,
      direction: val.direction,
    };
  }

  return {
    order,
    domRefs,
  };
}
