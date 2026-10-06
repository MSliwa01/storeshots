import { usage } from './errors.mjs';

// Store canvases. Each key is a screenshot slot in App Store Connect; the simulator
// captures at exactly this size, so raw captures and final slides share one canvas.
export const DEVICES = {
  'iphone-6.9': {
    label: 'iPhone 6.9"',
    width: 1320, height: 2868,
    asc: 'APP_IPHONE_67', // App Store Connect calls the 6.9" slot APP_IPHONE_67
    simulator: { name: 'iPhone 18 Pro Max Shots', type: 'com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro-Max' },
    frame: 'iphone-18-pro-max/black',
  },
  'ipad-13': {
    label: 'iPad 13"',
    width: 2064, height: 2752,
    asc: 'APP_IPAD_PRO_3GEN_129',
    simulator: { name: 'iPad Pro 13 Shots', type: 'com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M5-12GB' },
    frame: 'ipad-pro-13-m5/space-black',
  },
};

export function device(id) {
  const spec = DEVICES[id];
  if (!spec) throw usage(`unknown device "${id}"`, { fix: `known devices: ${Object.keys(DEVICES).join(', ')}` });
  return { id, ...spec };
}
