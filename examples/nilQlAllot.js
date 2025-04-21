import { NilQLWrapper } from "secretvaults";

/**
 * This is a standalone example of using NilQLWrapper to encrypt and decrypt data.
 * It is useful for testing and understanding the basic functionality of NilQLWrapper.
 */
async function main() {
  // Example data to encrypt
  const data = {
    name: { "%allot": "Steph" },
    years_in_web3: { "%allot": 5 },
    test_nested: {
      test_nested_2: {
        test_nested_3: { "%allot": "nested 3 levels down" },
        test_nested_4: null,
      },
    },
    rating_of_product: 8,
    test_null: null,
  };

  // The cluster config just needs an array of nodes for NilQLWrapper
  // - When using NilQLWrapper alone: nodes can be empty objects or contain any fields
  // - When using with SecretVaultWrapper: nodes must contain url and did fields
  const cluster = {
    nodes: [{}, {}, {}],
  };

  try {
    // Initialize wrapper with cluster config
    const encryptionWrapper = new NilQLWrapper(cluster);
    await encryptionWrapper.init();

    const allotted = await encryptionWrapper.prepareAndAllot(data);
    console.log("📚 Allot:", allotted);

    const unified = await encryptionWrapper.unify(allotted);
    console.log("📚 Unify:", unified);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Run the example
main().catch(console.error);
