// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ReactNode } from "react";
import type { WebBootstrapContext } from "../bootstrap/web.js";

export interface RouteConfig {
  id: string;
  path: string;
  label: string;
  icon: string;
  requiresAuth: boolean;
}

export interface AppRoutes {
  login: RouteConfig;
  checkout: RouteConfig;
  products: RouteConfig;
  tables: RouteConfig;
  cart: RouteConfig;
  settings: RouteConfig;
}

export const routes: AppRoutes = {
  login: {
    id: "login",
    path: "/login",
    label: "Login",
    icon: "🔑",
    requiresAuth: false
  },
  checkout: {
    id: "checkout",
    path: "/",
    label: "Checkout",
    icon: "🏠",
    requiresAuth: true
  },
  products: {
    id: "products",
    path: "/products",
    label: "Products",
    icon: "📦",
    requiresAuth: true
  },
  tables: {
    id: "tables",
    path: "/tables",
    label: "Tables",
    icon: "🍽️",
    requiresAuth: true
  },
  cart: {
    id: "cart",
    path: "/cart",
    label: "Cart",
    icon: "🛒",
    requiresAuth: true
  },
  settings: {
    id: "settings",
    path: "/settings",
    label: "Settings",
    icon: "⚙️",
    requiresAuth: true
  }
};

export const mobileTabs = [
  routes.tables,
  routes.products,
  routes.cart,
  routes.checkout,
  routes.settings
];

export interface RouterContextValue {
  context: WebBootstrapContext;
  authToken: string | null;
}

export type ProtectedRouteProps = {
  children: ReactNode;
  context: WebBootstrapContext;
  authToken: string | null;
};
