import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { join } from "node:path";

export class LocalSecretVault {
  readonly #key: Buffer;

  constructor(dataPath: string) {
    const path = join(dataPath, ".relay-store.key");
    if (!existsSync(path)) {
      writeFileSync(path, randomBytes(32), { mode: 0o600, flag: "wx" });
    }
    chmodSync(path, 0o600);
    this.#key = readFileSync(path);
    if (this.#key.length !== 32)
      throw new Error("Local relay secret key is invalid.");
  }

  encrypt(value: string): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, nonce);
    const ciphertext = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `v1.${nonce.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
  }

  decrypt(value: string): string {
    const [version, nonce, tag, ciphertext, extra] = value.split(".");
    if (
      version !== "v1" ||
      nonce === undefined ||
      tag === undefined ||
      ciphertext === undefined ||
      extra !== undefined
    )
      throw new Error("Stored relay secret is invalid.");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.#key,
      Buffer.from(nonce, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }
}
