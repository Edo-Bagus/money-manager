import { signOut } from "@/app/auth/actions";
import { requireUser } from "@/lib/auth/require-user";

// Placeholder for the "Tutup Hari" screen (SPEC §8.2, built in Phase 1).
// For now it only proves that login works.
export default async function TutupHariPage() {
  const user = await requireUser();

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Tutup Hari</h1>
        <form action={signOut}>
          <button
            type="submit"
            className="h-10 rounded-lg border border-neutral-300 px-4 text-sm font-medium"
          >
            Keluar
          </button>
        </form>
      </header>

      <p className="mt-2 text-sm text-neutral-600">Masuk sebagai {user.email}</p>

      <section className="mt-6 rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-600">
        Draft hari ini dan cek saldo akan muncul di sini (Fase 1).
      </section>
    </main>
  );
}
