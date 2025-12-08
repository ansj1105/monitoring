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
          SELECT COUNT(DISTINCT u.cloud_id) AS new_integrated_users
          FROM
              user_login_info uli
          JOIN
              users u ON uli.cloud_id = u.cloud_id
          WHERE
              uli.ssbyp = '00'
              AND u.reg_dt >= '2025-07-28 05:00:00'::timestamp with time zone
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
          SELECT COUNT(DISTINCT u.cloud_id) AS converted_integrated_users
          FROM
              user_login_info uli
          JOIN
              users u ON uli.cloud_id = u.cloud_id
          WHERE
              uli.ssbyp = '00'
              AND u.reg_dt < '2025-07-28 05:00:00'::timestamp with time zone
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
  },

  // 마일리지 관련 금액 통계
  getMileageStats: (date) => {
    const startDate = `${date} 00:00:00`;
    const endDate = `${date} 23:59:59`;

    return {
      text: `
        SELECT 
          mce.end_dt::date as date,
          COALESCE(sum(mce.elctc_pc), 0) as total_pc,
          COALESCE(sum(mce.paid_point_price), 0) as used_point,
          COALESCE(sum(mce.paid_card_price), 0) as use_card_price,
          COALESCE(sum(mce.paid_price), 0) as paid_price,
          COALESCE(sum(cmh.mileage), 0) as served_mileage,
          COALESCE(count(mce.id), 0) as charging_count,
          CASE 
            WHEN sum(mce.elctc_pc) > 0 THEN round((sum(cmh.mileage)/sum(mce.elctc_pc))* 100, 2)
            ELSE 0 
          END as elctc_pc_ratio,
          CASE 
            WHEN sum(mce.paid_price) > 0 THEN round((sum(cmh.mileage)/sum(mce.paid_price))* 100, 2)
            ELSE 0 
          END as paid_price_ratio,
          COALESCE(count(case when cmh.status = 'SUCCESS' then 1 END), 0) as point_success_count,
          COALESCE(count(case when cmh.status != 'SUCCESS' then 1 END), 0) as point_other_status_count,
          CASE 
            WHEN count(mce.id) > 0 THEN round(sum(mce.elctc_pc)/count(mce.id), 2)
            ELSE 0 
          END as avg_price,
          CASE 
            WHEN count(mce.id) > 0 THEN round(sum(mce.paid_price)/count(mce.id), 2)
            ELSE 0 
          END as avg_paid_price,
          CASE 
            WHEN count(mce.id) > 0 THEN round(sum(cmh.mileage)/count(mce.id), 2)
            ELSE 0 
          END as avg_mileage,
          COALESCE(sum(mce.elctc_qy), 0) as charging_qy
        FROM mmny_chrgr_elctc mce
        JOIN collect_mileage_history cmh on cmh.elctc_id::integer = mce.id
        WHERE mce.end_dt >= $1::timestamp AND mce.end_dt < $2::timestamp
        GROUP BY mce.end_dt::date 
        ORDER BY mce.end_dt::date
      `,
      values: [startDate, endDate]
    };
  },

  // 마일리지 관련 회원등급 별 통계
  getMileageGradeStats: (date) => {
    const startDate = `${date} 00:00:00`;
    const endDate = `${date} 23:59:59`;

    return {
      text: `
        SELECT 
          mce.end_dt::date as date,
          COALESCE(cmh.grade_nm, 'Unknown') as grade_nm,
          COALESCE(count(cmh.id), 0) as charging_count,
          CASE 
            WHEN count(cmh.id) > 0 THEN round(sum(mce.elctc_pc)/count(cmh.id), 2)
            ELSE 0 
          END as avg_pc,
          CASE 
            WHEN count(cmh.id) > 0 THEN round(sum(mce.paid_price)/count(cmh.id), 2)
            ELSE 0 
          END as avg_paid_price,
          CASE 
            WHEN count(cmh.id) > 0 THEN round(sum(cmh.mileage)/count(cmh.id), 2)
            ELSE 0 
          END as avg_mileage
        FROM mmny_chrgr_elctc mce
        JOIN collect_mileage_history cmh on cmh.elctc_id::integer = mce.id
        WHERE mce.end_dt >= $1::timestamp AND mce.end_dt < $2::timestamp 
        GROUP BY cmh.grade_nm, mce.end_dt::date 
        ORDER BY mce.end_dt::date, cmh.grade_nm
      `,
      values: [startDate, endDate]
    };
  },

  // 단순 회원 등록 카운트
  getDailyUserRegistration: (date) => {
    const startDate = `${date} 00:00:00`;
    const endDate = `${date} 23:59:59`;

    return {
      text: `
        SELECT 
          u.reg_dt::date as date, 
          COALESCE(count(u.id), 0) as registration_count
        FROM users as u
        WHERE u.reg_dt >= $1::timestamp AND u.reg_dt < $2::timestamp
        GROUP BY u.reg_dt::date 
        ORDER BY u.reg_dt::date
      `,
      values: [startDate, endDate]
    };
  },

  // 중복 카드 통계
  getDuplicateCardStats: () => {
    return {
      text: `
        SELECT 
          card_no, 
          COUNT(*) AS cnt
        FROM user_cards
        GROUP BY card_no
        HAVING COUNT(*) >= 2
        ORDER BY cnt DESC
      `,
      values: []
    };
  }
};

module.exports = { queries, convertKSTToUTC, convertUTCToKST }; 