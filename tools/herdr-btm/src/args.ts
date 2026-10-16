import { typeFlag } from "type-flag";

// argv-forwarding: btm
export function btmpArgs(): string[] {
  const args = process.argv.slice(2);
  // No wrapper flags: ignore downstream flags before type-flag assigns them,
  // including --__proto__. Forward the original tokens, spacing and -- unchanged.
  const parsed = typeFlag({}, [...args], { ignore: () => true });
  if (Object.keys(parsed.unknownFlags).length > 0) {
    process.stderr.write("btmp: unexpected wrapper flag\n");
    process.exit(2);
  }
  return args;
}
