const axios = require('axios');

async function reproduce() {
    const API_URL = 'http://localhost:3001/api';
    const testUid = 'repro_user_123';

    console.log('--- Step 1: Register User ---');
    await axios.post(`${API_URL}/users`, {
        uid: testUid,
        name: 'Repro User',
        studentId: '12345',
        teamNo: '99',
        score: 0,
        startTime: new Date().toISOString(),
        completed: false,
        lastActive: new Date().toISOString()
    });

    console.log('--- Step 2: Check Initial Leaderboard ---');
    let res = await axios.get(`${API_URL}/leaderboard`);
    console.log('Initial Score:', res.data.find(u => u.uid === testUid)?.score);

    console.log('--- Step 3: Update Score ---');
    await axios.post(`${API_URL}/users`, {
        uid: testUid,
        name: 'Repro User',
        studentId: '12345',
        teamNo: '99',
        score: 10,
        startTime: new Date().toISOString(),
        completed: false,
        lastActive: new Date().toISOString()
    });

    console.log('--- Step 4: Verify Leaderboard Update ---');
    res = await axios.get(`${API_URL}/leaderboard`);
    const updatedUser = res.data.find(u => u.uid === testUid);
    console.log('Updated Score:', updatedUser?.score);

    if (updatedUser?.score === 10) {
        console.log('SUCCESS: Leaderboard updated correctly in backend.');
    } else {
        console.log('FAILURE: Leaderboard score DID NOT update.');
    }
}

reproduce().catch(console.error);
