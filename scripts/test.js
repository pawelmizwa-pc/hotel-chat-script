#!/usr/bin/env node

// Hotel Smile Chat Agent - Test Script

const WORKER_URL = process.argv[2] || "http://localhost:8787";

const testCases = [
  {
    name: "Basic greeting",
    request: {
      sessionId: "test-session-1",
      message: "Witaj!",
      language: "pl",
    },
  },
  {
    name: "WiFi password request",
    request: {
      sessionId: "test-session-2",
      message: "Jakie jest hasło do WiFi?",
      language: "pl",
    },
  },
  {
    name: "Breakfast hours",
    request: {
      sessionId: "test-session-3",
      message: "Jakie są godziny śniadań?",
      language: "pl",
    },
  },
  {
    name: "SPA information",
    request: {
      sessionId: "test-session-4",
      message: "Opowiedz mi o ofercie SPA",
      language: "pl",
    },
  },
];

async function runTest(testCase) {
  console.log(`\n🧪 Testing: ${testCase.name}`);
  console.log(`📤 Request: ${testCase.request.message}`);

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(testCase.request),
    });

    const data = await response.json();

    if (response.ok) {
      console.log(`✅ Status: ${response.status}`);
      console.log(`💬 Response: ${data.text}`);
      console.log(
        `🔘 Quick Actions: ${data.message.content.result.length} buttons`
      );
      data.message.content.result.forEach((action, i) => {
        console.log(`   ${i + 1}. ${action.title} (${action.payload})`);
      });
    } else {
      console.log(`❌ Error: ${response.status}`);
      console.log(`💥 Message: ${data.error || data.message}`);
    }
  } catch (error) {
    console.log(`💥 Network Error: ${error.message}`);
  }
}

async function main() {
  console.log("🏨 Hotel Smile Chat Agent - Test Suite");
  console.log("=====================================");
  console.log(`🌐 Testing endpoint: ${WORKER_URL}`);

  for (const testCase of testCases) {
    await runTest(testCase);
    await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
  }

  console.log("\n✅ Test suite completed!");
}

// Handle Ctrl+C gracefully
process.on("SIGINT", () => {
  console.log("\n\n👋 Test suite interrupted");
  process.exit(0);
});

main().catch((error) => {
  console.error("💥 Test suite failed:", error);
  process.exit(1);
});
