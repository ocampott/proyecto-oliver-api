import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { env } from "../env.js";

export const DEVICE_COOKIE = "oliver_device";
const UN_ANIO_MS = 1000 * 60 * 60 * 24 * 365;

export function getDeviceToken(request: Request): string | null {
  return request.cookies[DEVICE_COOKIE] ?? null;
}

export function nuevoDeviceToken(): string {
  return randomBytes(32).toString("hex");
}

export function setDeviceCookie(res: Response, token: string): void {
  res.cookie(DEVICE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
    maxAge: UN_ANIO_MS,
    path: "/",
  });
}
