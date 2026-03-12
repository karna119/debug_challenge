const axios = require('axios');

async function testFix() {
    const API_URL = 'http://localhost:3001/api';
    const testUid = 'fix_test_user_' + Date.now();

    console.log('--- Phase 1: Create User ---');
    await axios.post(`${API_URL}/users`, {
        uid: testUid,
        name: 'Fix Test User',
        studentId: 'FIX123',
        teamNo: '1',
        score: 0,
        startTime: new Date().toISOString(),
        completed: false,
        lastActive: new Date().toISOString()
    });

    console.log('--- Phase 2: Submit Correct Answer (Q1, 10 pts) ---');
    await axios.post(`${API_URL}/submissions`, {
        userId: testUid,
        questionId: '1',
        code: 'print(1)',
        language: 'python',
        status: 'correct',
        timestamp: new Date().toISOString()
    });

    console.log('--- Phase 3: Check Score ---');
    const res = await axios.get(`${API_URL}/users/${testUid}`);
    console.log('User Score:', res.data.score);

    if (res.data.score === 10) {
        console.log('SUCCESS: Backend automatically updated score on submission!');
    } else {
        console.log('FAILURE: Score did not update. Expected 10, got:', res.data.score);
    }
}

testFix().catch(console.error);
