"use client";

import { useAuth } from "@/lib/auth";
import GymSettings from "./GymSettings";
import PlatformSettings from "./PlatformSettings";

export default function SettingsPage() {
  const { me } = useAuth();
  // The (app) layout blocks children until `me` is loaded, so this branch
  // never flashes the wrong variant.
  return me?.is_platform ? <PlatformSettings /> : <GymSettings />;
}
