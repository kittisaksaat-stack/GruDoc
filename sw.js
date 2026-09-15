/**
 * Service Worker — กรุเอกสาร
 * จำเป็นต้องมีเพื่อให้ Chrome / Edge ถือว่าเว็บนี้ "ติดตั้งได้" (installable PWA)
 * และเพื่อให้หน้าชวนติดตั้งเปิดได้แม้ออฟไลน์
 */
'use strict';

// ── ขึ้นเลขเวอร์ชันทุกครั้งที่แก้ไฟล์ในรายการ PRECACHE เพื่อบังคับให้ผู้ใช้ได้ของใหม่ ──
const CACHE_VERSION = 'v8';
const CACHE_NAME = `kru-ekasan-${CACHE_VERSION}`;

// ไฟล์เปลือกแอป (app shell) ที่ต้องมีติดเครื่องไว้เสมอ
const PRECACHE = [
  './',
  './index.html',
  './site.webmanifest',
  './favicon.ico',
  './favicon-16x16.png',
  './favicon-32x32.png',
  './favicon-48x48.png',
  './apple-touch-icon.png',
  './android-chrome-192x192.png',
  './android-chrome-512x512.png',
];

// ── ติดตั้ง: โหลดไฟล์เปลือกแอปเข้าแคช ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // addAll จะล้มทั้งชุดถ้ามีไฟล์ใดพัง จึงใช้ทีละไฟล์เพื่อไม่ให้การติดตั้งล้มเหลวทั้งหมด
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: 'reload' }));
          } catch (err) {
            console.warn('[SW] precache ไม่สำเร็จ:', url, err);
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

// ── เปิดใช้งาน: ลบแคชเวอร์ชันเก่าทิ้ง ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('kru-ekasan-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

// ── ดักจับ request: จำเป็นต่อเกณฑ์ installable ของ Chrome ──
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // จัดการเฉพาะ GET และเฉพาะ origin เดียวกัน (ลิงก์ Apps Script ปล่อยผ่านไปเน็ตตามปกติ)
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // หน้าเว็บ (navigation): เอาของใหม่จากเน็ตก่อน ถ้าเน็ตล่มค่อยใช้แคช
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put('./index.html', fresh.clone());
          return fresh;
        } catch (err) {
          const cached = await caches.match('./index.html');
          if (cached) return cached;
          return new Response('ออฟไลน์ และยังไม่มีข้อมูลในแคช', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
      })()
    );
    return;
  }

  // ไฟล์คงที่ (ไอคอน/manifest): ใช้แคชก่อนเพื่อความเร็ว ไม่มีค่อยไปเน็ต
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const fresh = await fetch(request);
        if (fresh && fresh.status === 200 && fresh.type === 'basic') {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, fresh.clone());
        }
        return fresh;
      } catch (err) {
        console.warn('[SW] โหลดไม่สำเร็จและไม่มีในแคช:', request.url, err);
        return Response.error();
      }
    })()
  );
});
