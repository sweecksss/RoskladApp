import { getFcmMessaging } from './firebase.js';
import { getState, removeDevices } from './store.js';

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export async function sendPush({ title, body, data = {} }) {
  const devices = getState().devices;
  if (!devices.length) return { sent: 0, failed: 0, skipped: 0, reason: 'no-devices' };
  const messaging = getFcmMessaging();
  if (!messaging) return { sent: 0, failed: 0, skipped: devices.length, reason: 'fcm-disabled-or-not-configured' };

  let sent = 0;
  let failed = 0;
  const invalidTokens = [];
  for (const batch of chunks(devices, 500)) {
    const response = await messaging.sendEachForMulticast({
      tokens: batch.map((device) => device.token),
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value)]))
    });
    sent += response.successCount;
    failed += response.failureCount;
    response.responses.forEach((item, index) => {
      const code = item.error?.code || '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) invalidTokens.push(batch[index].token);
    });
  }
  if (invalidTokens.length) removeDevices(invalidTokens);
  return { sent, failed, skipped: 0, removedInvalidTokens: invalidTokens.length };
}
