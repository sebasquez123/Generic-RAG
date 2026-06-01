import { Role } from "~/shared/middleware/context/types/context.types";

export const roleSymbol = Symbol('role');
export const role = (role: Role) => {
    return (target: any, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
        if (propertyKey && descriptor) {
            Reflect.defineMetadata(roleSymbol, role, target, propertyKey);
        } else {
            Reflect.defineMetadata(roleSymbol, role, target);
        }
    }
}