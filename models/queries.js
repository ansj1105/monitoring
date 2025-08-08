const moment = require('moment-timezone');

// KST 기준으로 날짜를 UTC로 변환하는 함수
function convertKSTToUTC(kstDate) {
  return moment.tz(kstDate, 'Asia/Seoul').utc().format('YYYY-MM-DD HH:mm:ss');
}

// UTC 기준으로 날짜를 KST로 변환하는 함수
function convertUTCToKST(utcDate) {
  return moment.utc(utcDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss');
}

const queries = {
  // 통합 신규 + 전환 회원수
  getTotalIntegratedUsers: (startDate, endDate) => {
    const startKST = `${startDate} 00:00:00`;
    const endKST = `${endDate} 23:59:59`;
    
    return {
      text: `
        SELECT
          COUNT(DISTINCT uli.cloud_id) AS total_integrated_users
        FROM
          user_login_info uli
        WHERE
          uli.ssbyp = '00'
          AND (uli.reg_dt AT TIME ZONE 'KST') BETWEEN $1::timestamp AND $2::timestamp
      `,
      values: [startKST, endKST]
    };
  },

  // 통합 신규 회원수
  getNewIntegratedUsers: (startDate, endDate) => {
    const startKST = `${startDate} 00:00:00`;
    const endKST = `${endDate} 23:59:59`;
    
    return {
      text: `
        SELECT
          COUNT(DISTINCT u.cloud_id) AS new_integrated_users
        FROM
          user_login_info uli
        JOIN
          users u ON uli.cloud_id = u.cloud_id
        WHERE
          u.reg_dt >= '2025-07-28 05:00:00'::timestamp with time zone
          AND (uli.reg_dt AT TIME ZONE 'KST') BETWEEN $1::timestamp AND $2::timestamp
      `,
      values: [startKST, endKST]
    };
  },

  // 통합 전환 회원수
  getConvertedIntegratedUsers: (startDate, endDate) => {
    const startKST = `${startDate} 00:00:00`;
    const endKST = `${endDate} 23:59:59`;
    
    return {
      text: `
        SELECT
          COUNT(DISTINCT u.cloud_id) AS converted_integrated_users
        FROM
          user_login_info uli
        JOIN
          users u ON uli.cloud_id = u.cloud_id
        WHERE
          u.reg_dt < '2025-07-28 05:00:00'::timestamp with time zone
          AND (uli.reg_dt AT TIME ZONE 'KST') BETWEEN $1::timestamp AND $2::timestamp
      `,
      values: [startKST, endKST]
    };
  },

  // 실물 카드 신청수
  getPhysicalCardRequests: (startDate, endDate) => {
    const startKST = `${startDate} 00:00:00`;
    const endKST = `${endDate} 23:59:59`;
    
    return {
      text: `
        SELECT
          COUNT(*) AS physical_card_requests
        FROM
          user_card_hist uch
        WHERE
          uch.actor = '회원실물카드신청'
          AND (uch.reg_dt AT TIME ZONE 'KST') BETWEEN $1::timestamp AND $2::timestamp
      `,
      values: [startKST, endKST]
    };
  },

  // 온라인 카드 자동 발급 수
  getOnlineAutoIssuedCards: (startDate, endDate) => {
    const startKST = `${startDate} 00:00:00`;
    const endKST = `${endDate} 23:59:59`;
    
    return {
      text: `
        SELECT
          COUNT(DISTINCT uch.user_id) AS online_auto_issued_cards
        FROM
          user_card_hist uch
        WHERE
          uch.status = '발급완료'
          AND uch.card_ty = '온라인'
          AND (uch.reg_dt AT TIME ZONE 'KST') BETWEEN $1::timestamp AND $2::timestamp
      `,
      values: [startKST, endKST]
    };
  },

  // 일별 통합 데이터 (모든 지표 포함)
  getDailyIntegrationData: (date) => {
    const startDate = `${date} 00:00:00`;
    const endDate = `${date} 23:59:59`;
    
    return {
      text: `
        SELECT
          (SELECT COUNT(DISTINCT uli.cloud_id) 
           FROM user_login_info uli 
           WHERE uli.ssbyp = '00' 
           AND (uli.reg_dt AT TIME ZONE 'KST') BETWEEN $1::timestamp AND $2::timestamp) AS total_integrated_users,
          
          (SELECT COUNT(DISTINCT u.cloud_id) 
           FROM user_login_info uli 
           JOIN users u ON uli.cloud_id = u.cloud_id 
           WHERE u.reg_dt >= '2025-07-28 05:00:00'::timestamp with time zone 
           AND (uli.reg_dt AT TIME ZONE 'KST') BETWEEN $1::timestamp AND $2::timestamp) AS new_integrated_users,
          
          (SELECT COUNT(DISTINCT u.cloud_id) 
           FROM user_login_info uli 
           JOIN users u ON uli.cloud_id = u.cloud_id 
           WHERE u.reg_dt < '2025-07-28 05:00:00'::timestamp with time zone 
           AND (uli.reg_dt AT TIME ZONE 'KST') BETWEEN $1::timestamp AND $2::timestamp) AS converted_integrated_users,
          
          (SELECT COUNT(*) 
           FROM user_card_hist uch 
           WHERE uch.actor = '회원실물카드신청' 
           AND (uch.reg_dt AT TIME ZONE 'KST') BETWEEN $1::timestamp AND $2::timestamp) AS physical_card_requests,
          
          (SELECT COUNT(DISTINCT uch.user_id) 
           FROM user_card_hist uch 
           WHERE uch.status = '발급완료' 
           AND uch.card_ty = '온라인' 
           AND (uch.reg_dt AT TIME ZONE 'KST') BETWEEN $1::timestamp AND $2::timestamp) AS online_auto_issued_cards
      `,
      values: [startDate, endDate]
    };
  }
};

module.exports = { queries, convertKSTToUTC, convertUTCToKST }; 