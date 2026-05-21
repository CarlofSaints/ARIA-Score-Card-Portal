import type { User } from "./types";
import { readJson, writeJson } from "./blob";
import { v4 as uuid } from "uuid";
import bcrypt from "bcryptjs";

function usersKey(tenantSlug: string): string {
  return `${tenantSlug}/users.json`;
}

export async function getUsers(tenantSlug: string): Promise<User[]> {
  return readJson<User[]>(usersKey(tenantSlug), []);
}

export async function getUserById(
  tenantSlug: string,
  userId: string
): Promise<User | null> {
  const users = await getUsers(tenantSlug);
  return users.find((u) => u.id === userId) ?? null;
}

export async function getUserByEmail(
  tenantSlug: string,
  email: string
): Promise<User | null> {
  const users = await getUsers(tenantSlug);
  return users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function createUser(
  tenantSlug: string,
  data: {
    name: string;
    email: string;
    password: string; // plain text — will be hashed
    role: User["role"];
    forcePasswordChange: boolean;
  }
): Promise<User> {
  const users = await getUsers(tenantSlug);
  if (users.some((u) => u.email.toLowerCase() === data.email.toLowerCase())) {
    throw new Error(`User with email "${data.email}" already exists`);
  }

  const hash = await bcrypt.hash(data.password, 10);
  const user: User = {
    id: uuid(),
    name: data.name,
    email: data.email.toLowerCase(),
    password: hash,
    role: data.role,
    forcePasswordChange: data.forcePasswordChange,
    active: true,
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  await writeJson(usersKey(tenantSlug), users);
  return user;
}

export async function updateUser(
  tenantSlug: string,
  userId: string,
  updates: Partial<Pick<User, "name" | "email" | "role" | "active" | "forcePasswordChange" | "lastLoginAt">>
): Promise<User> {
  const users = await getUsers(tenantSlug);
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) throw new Error("User not found");

  users[idx] = { ...users[idx], ...updates };
  await writeJson(usersKey(tenantSlug), users);
  return users[idx];
}

export async function setUserPassword(
  tenantSlug: string,
  userId: string,
  newPassword: string
): Promise<void> {
  const users = await getUsers(tenantSlug);
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) throw new Error("User not found");

  users[idx].password = await bcrypt.hash(newPassword, 10);
  users[idx].forcePasswordChange = false;
  await writeJson(usersKey(tenantSlug), users);
}

export async function deleteUser(
  tenantSlug: string,
  userId: string
): Promise<void> {
  const users = await getUsers(tenantSlug);
  const filtered = users.filter((u) => u.id !== userId);
  await writeJson(usersKey(tenantSlug), filtered);
}

export async function verifyPassword(
  user: User,
  plainPassword: string
): Promise<boolean> {
  return bcrypt.compare(plainPassword, user.password);
}
