import type { Cart } from "../cart/cart-service";
import type { Order } from "../domain/order";
import { InMemoryRepository } from "./memory";
import { normalizeEmail, type Customer } from "../domain/customer";

export class CustomerRepository extends InMemoryRepository<Customer> {
  constructor() {
    super("customer");
  }

  findByEmail(email: string): Customer | undefined {
    const wanted = normalizeEmail(email);
    return this.find((c) => c.email === wanted)[0];
  }
}

export class OrderRepository extends InMemoryRepository<Order> {
  constructor() {
    super("order");
  }

  findByCustomer(customerId: string): Order[] {
    return this.find((o) => o.customerId === customerId);
  }
}

export class CartRepository extends InMemoryRepository<Cart> {
  constructor() {
    super("cart");
  }

  findByCustomer(customerId: string): Cart | undefined {
    return this.find((c) => c.customerId === customerId)[0];
  }
}
