export const isPublicSymbol = Symbol('isPublic');

export const Public = () => {
  return (
    target: any,
    propertyKey?: string | symbol,
    descriptor?: PropertyDescriptor,
  ) => {
    if (propertyKey && descriptor) {
      Reflect.defineMetadata(isPublicSymbol, true, target, propertyKey);
    } else {
      Reflect.defineMetadata(isPublicSymbol, true, target);
    }
  };
};
