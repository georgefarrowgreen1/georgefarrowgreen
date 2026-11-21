import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readMailAuthentication } from '../../../account/admin.js';

test('reads the folded iCloud authentication headers and exposes only the envelope domain', () => {
  const headers = [
    'Return-Path: <unique-return-token@cf-bounce.inflite.ai>',
    'Authentication-Results: spf.icloud.com; spf=pass (sender SPF authorized)',
    '\tsmtp.mailfrom=unique-return-token@cf-bounce.inflite.ai',
    'Authentication-Results: dkim.icloud.com; dkim=pass header.d=inflite.ai',
    'Authentication-Results: dmarc.icloud.com; dmarc=pass header.from=inflite.ai',
  ].join('\r\n');
  assert.deepEqual(readMailAuthentication(headers), {
    checks: {
      spf: [{ server: 'spf.icloud.com', result: 'pass', domain: 'cf-bounce.inflite.ai' }],
      dkim: [{ server: 'dkim.icloud.com', result: 'pass', domain: 'inflite.ai' }],
      dmarc: [{ server: 'dmarc.icloud.com', result: 'pass', domain: 'inflite.ai' }],
    },
    returnPathDomain: 'cf-bounce.inflite.ai',
  });
});

test('keeps conflicting server results and ignores signatures in the message body or ARC wrappers', () => {
  const source = [
    'Authentication-Results: dmarc.icloud.com; DMARC=fail header.from=bad.example',
    'Authentication-Results: mx.google.com; dkim=pass header.i=@inflite.ai; dmarc=pass header.from=inflite.ai',
    'ARC-Authentication-Results: i=1; third.example; spf=pass',
    '',
    'Authentication-Results: body.example; spf=pass; dmarc=pass',
  ].join('\n');
  assert.deepEqual(readMailAuthentication(source), {
    checks: {
      spf: [],
      dkim: [{ server: 'mx.google.com', result: 'pass', domain: 'inflite.ai' }],
      dmarc: [
        { server: 'dmarc.icloud.com', result: 'fail', domain: 'bad.example' },
        { server: 'mx.google.com', result: 'pass', domain: 'inflite.ai' },
      ],
    },
    returnPathDomain: '',
  });
});
