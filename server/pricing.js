/* =============================================================
   MAISON Cinema — คำนวณราคาตั๋วและส่วนลดโปรโมชัน (ฟังก์ชันบริสุทธิ์)
   ส่วนลดคิดเฉพาะค่าตั๋ว ค่าบริการคิดเต็มทุกที่นั่ง
   rule: { type: 'percent_off' | 'bundle_price' | 'unit_price', value,
           weekday (0=อาทิตย์…6) | null, timeFrom 'HH:MM' | null, timeTo 'HH:MM' (ไม่รวม) | null,
           seatCount | null }
   ============================================================= */
'use strict';

const { ApiError } = require('./http');

const WEEKDAYS_TH = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];

function weekdayOf(dateISO) {
  return new Date(dateISO + 'T00:00:00Z').getUTCDay();
}

function quote(input) {
  const seatCount = input.seatCount;
  const ticketSubtotal = input.unit * seatCount;
  const serviceFee = input.fee * seatCount;
  const rule = input.rule;
  if (!input.promoCode) {
    return { ticketSubtotal, discount: 0, serviceFee, total: ticketSubtotal + serviceFee, promoCode: null };
  }
  if (!rule) { throw new ApiError(422, 'โค้ดนี้ยังไม่เปิดให้คำนวณส่วนลด'); }
  if (rule.weekday != null && weekdayOf(input.date) !== rule.weekday) {
    throw new ApiError(422, 'โค้ดนี้ใช้ได้เฉพาะรอบฉาย' + WEEKDAYS_TH[rule.weekday]);
  }
  if (rule.timeFrom && input.time < rule.timeFrom) {
    throw new ApiError(422, 'โค้ดนี้ใช้ได้กับรอบฉายเวลา ' + rule.timeFrom + ' น. ขึ้นไป');
  }
  if (rule.timeTo && input.time >= rule.timeTo) {
    throw new ApiError(422, 'โค้ดนี้ใช้ได้กับรอบฉายก่อนเวลา ' + rule.timeTo + ' น.');
  }
  if (rule.seatCount != null && seatCount !== rule.seatCount) {
    throw new ApiError(422, 'โค้ดนี้ใช้ได้กับการจองพอดี ' + rule.seatCount + ' ที่นั่ง');
  }
  let discounted;
  if (rule.type === 'percent_off') { discounted = Math.round(ticketSubtotal * (100 - rule.value) / 100); }
  else if (rule.type === 'bundle_price') { discounted = rule.value; }
  else if (rule.type === 'unit_price') { discounted = rule.value * seatCount; }
  else { throw new ApiError(422, 'โค้ดนี้ยังไม่เปิดให้คำนวณส่วนลด'); }
  const discount = ticketSubtotal - discounted;
  if (discount <= 0) { throw new ApiError(422, 'โค้ดนี้ไม่ทำให้ราคาถูกลง'); }
  return { ticketSubtotal, discount, serviceFee, total: discounted + serviceFee, promoCode: input.promoCode };
}

module.exports = { quote, weekdayOf, WEEKDAYS_TH };
