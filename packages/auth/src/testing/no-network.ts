// Vitest setup: fails any test that tries to open a network connection.
// nodemailer and other libraries reach the network through these functions.
import net from "node:net";
import tls from "node:tls";

function refuse(): never {
  throw new Error("Tests must not open network connections.");
}

net.connect = refuse;
net.createConnection = refuse;
net.Socket.prototype.connect = refuse;
tls.connect = refuse;
globalThis.fetch = refuse;
