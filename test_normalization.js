const normalize = (str) => str.replace(/\s+/g, ' ').trim();

const testCases = [
    {
        name: "Question 1 (Newlines vs Spaces)",
        expected: "1\n2\n3\n4\n5\n",
        actual: "1 2 3 4 5"
    },
    {
        name: "Question 2 (Trailing Space)",
        expected: "1 2 3 4 5",
        actual: "1 2 3 4 5 "
    },
    {
        name: "Question 4 (Fixed with different whitespace)",
        expected: "10\n20\n30\n40\n",
        actual: "10 20 30 40"
    },
    {
        name: "Question 10 (Lists with newlines)",
        expected: "[1]\n[2]\n[3]\n",
        actual: "[1] [2] [3]"
    },
    {
        name: "Question 5 (No newline in expected)",
        expected: "15",
        actual: "15\n"
    }
];

testCases.forEach(tc => {
    const normExpected = normalize(tc.expected);
    const normActual = normalize(tc.actual);
    const passed = normExpected === normActual;
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${tc.name}`);
    if (!passed) {
        console.log(`  Expected: "${normExpected}"`);
        console.log(`  Actual:   "${normActual}"`);
    }
});
