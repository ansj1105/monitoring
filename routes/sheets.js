const express = require('express');
const router = express.Router();
const GoogleSheetsService = require('../services/sheets');
const pool = require('../config/database');
const { queries } = require('../models/queries');
const cron = require('node-cron');

const sheetsService = new GoogleSheetsService();

// Google Sheets 헤더 설정
router.post('/setup-headers', async (req, res) => {
  try {
    await sheetsService.setupHeaders();
    res.json({ message: 'Google Sheets 헤더 설정 완료' });
  } catch (error) {
    console.error('헤더 설정 실패:', error);
    res.status(500).json({ error: '헤더 설정 중 오류가 발생했습니다.' });
  }
});

// dataset2 시트 헤더 설정
router.post('/setup-dataset2-headers', async (req, res) => {
  try {
    await sheetsService.setupDataset2Headers();
    res.json({ message: 'dataset2 시트 헤더 설정 완료' });
  } catch (error) {
    console.error('dataset2 헤더 설정 실패:', error);
    res.status(500).json({ error: 'dataset2 헤더 설정 중 오류가 발생했습니다.' });
  }
});

// 일별 데이터를 Google Sheets에 업데이트
router.post('/update-daily/:date', async (req, res) => {
  try {
    const { date } = req.params;
    
    // 데이터베이스에서 일별 데이터 조회
    const query = queries.getDailyIntegrationData(date);
    const result = await pool.query(query.text, query.values);
    
    // Google Sheets에 업데이트
    await sheetsService.updateDailyData(date, result.rows[0] || {
      total_integrated_users: 0,
      new_integrated_users: 0,
      converted_integrated_users: 0,
      physical_card_requests: 0,
      online_auto_issued_cards: 0
    });

    res.json({ message: `${date} 데이터 업데이트 완료` });
  } catch (error) {
    console.error('일별 데이터 업데이트 실패:', error);
    res.status(500).json({ error: '데이터 업데이트 중 오류가 발생했습니다.' });
  }
});

// 기간별 데이터를 Google Sheets에 업데이트
router.post('/update-period', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: '시작일과 종료일을 입력해주세요.' });
    }

    const currentDate = new Date(startDate);
    const endDateTime = new Date(endDate);
    const results = [];

    while (currentDate <= endDateTime) {
      const dateStr = currentDate.toISOString().split('T')[0];
      
      // 데이터베이스에서 일별 데이터 조회
      const query = queries.getDailyIntegrationData(dateStr);
      const result = await pool.query(query.text, query.values);
      
      // Google Sheets에 업데이트
      await sheetsService.updateDailyData(dateStr, result.rows[0] || {
        total_integrated_users: 0,
        new_integrated_users: 0,
        converted_integrated_users: 0,
        physical_card_requests: 0,
        online_auto_issued_cards: 0
      });

      results.push(dateStr);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    res.json({ 
      message: `${startDate} ~ ${endDate} 기간 데이터 업데이트 완료`,
      dates: results
    });
  } catch (error) {
    console.error('기간별 데이터 업데이트 실패:', error);
    res.status(500).json({ error: '데이터 업데이트 중 오류가 발생했습니다.' });
  }
});

// 자동 업데이트 스케줄러
let autoUpdateJob = null;

// 자동 업데이트 시작
router.post('/start-auto-update', (req, res) => {
  try {
    if (autoUpdateJob) {
      return res.json({ message: '자동 업데이트가 이미 실행 중입니다.' });
    }
    // 매일 오전 9시에 전날 데이터 업데이트
    autoUpdateJob = cron.schedule('0 9 * * *', async () => {
    // // 매일 오전 10시 36분에 전날 데이터 업데이트 (테스트용)
    // autoUpdateJob = cron.schedule('37 10 * * *', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split('T')[0];
      
      try {
        const query = queries.getDailyIntegrationData(dateStr);
        const result = await pool.query(query.text, query.values);
        
        await sheetsService.updateDailyData(dateStr, result.rows[0] || {
          total_integrated_users: 0,
          new_integrated_users: 0,
          converted_integrated_users: 0,
          physical_card_requests: 0,
          online_auto_issued_cards: 0
        });

        console.log(`자동 업데이트 완료: ${dateStr}`);
      } catch (error) {
        console.error(`자동 업데이트 실패 (${dateStr}):`, error);
      }
    });

    res.json({ message: '자동 업데이트가 시작되었습니다. (매일 오전 9시)' });
  } catch (error) {
    console.error('자동 업데이트 시작 실패:', error);
    res.status(500).json({ error: '자동 업데이트 시작 중 오류가 발생했습니다.' });
  }
});

// 자동 업데이트 중지
router.post('/stop-auto-update', (req, res) => {
  try {
    if (!autoUpdateJob) {
      return res.json({ message: '자동 업데이트가 실행 중이지 않습니다.' });
    }

    autoUpdateJob.stop();
    autoUpdateJob = null;
    res.json({ message: '자동 업데이트가 중지되었습니다.' });
  } catch (error) {
    console.error('자동 업데이트 중지 실패:', error);
    res.status(500).json({ error: '자동 업데이트 중지 중 오류가 발생했습니다.' });
  }
});

module.exports = router;