const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { queries } = require('../models/queries');

// 일별 통합 데이터 조회
router.get('/daily/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const query = queries.getDailyIntegrationData(date);
    const result = await pool.query(query.text, query.values);
    
    res.json({
      date: date,
      data: result.rows[0] || {
        total_integrated_users: 0,
        new_integrated_users: 0,
        converted_integrated_users: 0,
        physical_card_requests: 0,
        online_auto_issued_cards: 0
      }
    });
  } catch (error) {
    console.error('Error fetching daily data:', error);
    res.status(500).json({ error: '데이터 조회 중 오류가 발생했습니다.' });
  }
});

// 기간별 통합 신규 + 전환 회원수
router.get('/total-integrated-users', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = queries.getTotalIntegratedUsers(startDate, endDate);
    const result = await pool.query(query.text, query.values);
    
    res.json({
      period: { startDate, endDate },
      total_integrated_users: result.rows[0]?.total_integrated_users || 0
    });
  } catch (error) {
    console.error('Error fetching total integrated users:', error);
    res.status(500).json({ error: '데이터 조회 중 오류가 발생했습니다.' });
  }
});

// 기간별 통합 신규 회원수
router.get('/new-integrated-users', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = queries.getNewIntegratedUsers(startDate, endDate);
    const result = await pool.query(query.text, query.values);
    
    res.json({
      period: { startDate, endDate },
      new_integrated_users: result.rows[0]?.new_integrated_users || 0
    });
  } catch (error) {
    console.error('Error fetching new integrated users:', error);
    res.status(500).json({ error: '데이터 조회 중 오류가 발생했습니다.' });
  }
});

// 기간별 통합 전환 회원수
router.get('/converted-integrated-users', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = queries.getConvertedIntegratedUsers(startDate, endDate);
    const result = await pool.query(query.text, query.values);
    
    res.json({
      period: { startDate, endDate },
      converted_integrated_users: result.rows[0]?.converted_integrated_users || 0
    });
  } catch (error) {
    console.error('Error fetching converted integrated users:', error);
    res.status(500).json({ error: '데이터 조회 중 오류가 발생했습니다.' });
  }
});

// 기간별 실물 카드 신청수
router.get('/physical-card-requests', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = queries.getPhysicalCardRequests(startDate, endDate);
    const result = await pool.query(query.text, query.values);
    
    res.json({
      period: { startDate, endDate },
      physical_card_requests: result.rows[0]?.physical_card_requests || 0
    });
  } catch (error) {
    console.error('Error fetching physical card requests:', error);
    res.status(500).json({ error: '데이터 조회 중 오류가 발생했습니다.' });
  }
});

// 기간별 온라인 카드 자동 발급 수
router.get('/online-auto-issued-cards', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = queries.getOnlineAutoIssuedCards(startDate, endDate);
    const result = await pool.query(query.text, query.values);
    
    res.json({
      period: { startDate, endDate },
      online_auto_issued_cards: result.rows[0]?.online_auto_issued_cards || 0
    });
  } catch (error) {
    console.error('Error fetching online auto issued cards:', error);
    res.status(500).json({ error: '데이터 조회 중 오류가 발생했습니다.' });
  }
});

// 모든 지표를 한 번에 조회
router.get('/all-metrics', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const [
      totalUsers,
      newUsers,
      convertedUsers,
      physicalCards,
      onlineCards
    ] = await Promise.all([
      pool.query(queries.getTotalIntegratedUsers(startDate, endDate).text, queries.getTotalIntegratedUsers(startDate, endDate).values),
      pool.query(queries.getNewIntegratedUsers(startDate, endDate).text, queries.getNewIntegratedUsers(startDate, endDate).values),
      pool.query(queries.getConvertedIntegratedUsers(startDate, endDate).text, queries.getConvertedIntegratedUsers(startDate, endDate).values),
      pool.query(queries.getPhysicalCardRequests(startDate, endDate).text, queries.getPhysicalCardRequests(startDate, endDate).values),
      pool.query(queries.getOnlineAutoIssuedCards(startDate, endDate).text, queries.getOnlineAutoIssuedCards(startDate, endDate).values)
    ]);
    
    res.json({
      period: { startDate, endDate },
      metrics: {
        total_integrated_users: totalUsers.rows[0]?.total_integrated_users || 0,
        new_integrated_users: newUsers.rows[0]?.new_integrated_users || 0,
        converted_integrated_users: convertedUsers.rows[0]?.converted_integrated_users || 0,
        physical_card_requests: physicalCards.rows[0]?.physical_card_requests || 0,
        online_auto_issued_cards: onlineCards.rows[0]?.online_auto_issued_cards || 0
      }
    });
  } catch (error) {
    console.error('Error fetching all metrics:', error);
    res.status(500).json({ error: '데이터 조회 중 오류가 발생했습니다.' });
  }
});

module.exports = router; 