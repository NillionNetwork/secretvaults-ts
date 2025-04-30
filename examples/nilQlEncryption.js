import { NilQLWrapper } from "secretvaults";

/**
 * This is a standalone example of using NilQLWrapper to encrypt and decrypt data.
 * It is useful for testing and understanding the basic functionality of NilQLWrapper.
 */
async function main() {
  // Example data to encrypt
  const secretData = 4269;

  // The cluster config just needs an array of nodes for NilQLWrapper
  // - When using NilQLWrapper alone: nodes can be empty objects or contain any fields
  // - When using with SecretVaultWrapper: nodes must contain url and did fields
  const cluster = {
    nodes: [{}, {}, {}],
  };

  try {
    // Initialize wrapper with cluster config
    console.log("Initializing NilQLWrapper...");
    const encryptionWrapper = new NilQLWrapper(cluster);
    await encryptionWrapper.init();
    console.log("NilQLWrapper initialized successfully");

    console.log("\nOriginal data:", secretData);

    // Encrypt data into multiple shares
    console.log("\nEncrypting data...");
    const shares = await encryptionWrapper.encrypt(secretData);
    console.log("Data encrypted into shares:", shares);

    // Decrypt shares back into original data
    console.log("\nDecrypting shares...");
    const decryptedData = await encryptionWrapper
      .decrypt(shares)
      .then((data) => data);

    // Convert decrypted string back to number
    console.log("Decrypted data:", Number(decryptedData));
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Run the example
main().catch(console.error);
