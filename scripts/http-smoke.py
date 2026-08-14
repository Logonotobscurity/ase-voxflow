#!/usr/bin/env python3
"""Production-server smoke checks for demo/memory mode.

Run `npm run build`, start the server with demo identity and memory persistence,
then execute this script. It uses only the Python standard library.
"""

import json
import os
import uuid
import urllib.error
import urllib.request

BASE = os.environ.get('ASE_SMOKE_BASE_URL', 'http://127.0.0.1:3000')
EXPECTED_PERSISTENCE = os.environ.get('ASE_SMOKE_EXPECTED_PERSISTENCE', 'ephemeral-memory')
DEFAULT_HEADERS = {
    'content-type': 'application/json',
    'x-ase-tenant-id': 'tenant_smoke',
    'x-ase-actor-id': 'actor_builder',
    'x-ase-role': 'BUILDER',
}
canonical_results = []
legacy_results = []
run_id = uuid.uuid4().hex[:12]


def call(method, path, body=None, headers=None, expected=200, group=canonical_results, raw=False):
    merged = dict(DEFAULT_HEADERS)
    if headers:
        merged.update(headers)
    if body is None:
        data = None
    elif raw:
        data = body
    else:
        data = json.dumps(body).encode()
    request = urllib.request.Request(BASE + path, data=data, headers=merged, method=method)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            status = response.status
            response_body = response.read()
            content_type = response.headers.get('content-type', '')
    except urllib.error.HTTPError as error:
        status = error.code
        response_body = error.read()
        content_type = error.headers.get('content-type', '')
    payload = json.loads(response_body) if 'application/json' in content_type else response_body.decode()
    assert status == expected, f'{method} {path}: expected {expected}, got {status}: {payload}'
    group.append((method, path, status))
    return payload


# Browser-facing pages render from the optimized production build.
for page_path in ['/', '/app/canvas', '/app/voice', '/app/vendors']:
    html = call('GET', page_path)
    assert isinstance(html, str) and '<!DOCTYPE HTML>' in html.upper()

# Stable validation and authorization errors.
invalid = call('POST', '/api/v1/workflows', {'name': ''}, expected=422)
assert invalid['error']['code'] == 'VALIDATION_ERROR' and invalid['error']['retryable'] is False
forbidden = call('POST', '/api/v1/workflows', {
    'name': 'Viewer attempt', 'description': '', 'nodes': [], 'edges': [], 'metadata': {}
}, headers={'x-ase-role': 'VIEWER'}, expected=403)
assert forbidden['error']['code'] == 'AUTHORIZATION_DENIED'

workflow_id = f'workflow_smoke_{run_id}'
workflow = {
    'id': workflow_id,
    'name': 'Production smoke workflow',
    'description': 'Ephemeral deterministic API smoke test',
    'status': 'READY',
    'version': 1,
    'nodes': [
        {'id': 'node_trigger', 'type': 'trigger', 'label': 'Receive request',
         'configuration': {'executionMode': 'demo'},
         'retryPolicy': {'maxRetries': 0, 'backoffMs': 0}, 'metadata': {}},
        {'id': 'node_action', 'type': 'action', 'label': 'Record deterministic result',
         'configuration': {'executionMode': 'demo'},
         'retryPolicy': {'maxRetries': 0, 'backoffMs': 0}, 'metadata': {}},
    ],
    'edges': [{'id': 'edge_trigger_action', 'source': 'node_trigger', 'target': 'node_action', 'metadata': {}}],
    'metadata': {'purpose': 'smoke'},
}
saved = call('POST', '/api/v1/workflows', workflow, expected=201)
assert saved['data']['workflow']['id'] == workflow_id
assert saved['data']['persistence'] == EXPECTED_PERSISTENCE
listed = call('GET', '/api/v1/workflows')
assert any(item['id'] == workflow_id for item in listed['data']['workflows'])
isolated = call('GET', '/api/v1/workflows', headers={
    'x-ase-tenant-id': 'tenant_other',
    'x-ase-actor-id': 'actor_other',
})
assert all(item['id'] != workflow_id for item in isolated['data']['workflows'])

run = call('POST', f'/api/v1/workflows/{workflow_id}/executions', {
    'input': {'source': 'smoke'}, 'maxDurationMs': 5_000, 'maxCostMinor': 100
}, expected=202)
assert run['data']['execution']['status'] == 'COMPLETED'
assert len(run['data']['execution']['nodeResults']) == 2
assert run['data']['execution']['output']['evidenceCount'] == 2
assert len(run['data']['evidence']) == 2
executions = call('GET', f'/api/v1/workflows/{workflow_id}/executions')
assert any(item['id'] == run['data']['execution']['id'] for item in executions['data']['executions'])

transaction_input = {
    'type': 'PURCHASE_ORDER', 'amountMinor': 250_000_000, 'currency': 'ngn',
    'recipient': 'Port Harcourt Packaging Cooperative',
    'idempotencyKey': f'smoke-transaction-{run_id}', 'metadata': {'source': 'smoke'},
}
requested = call('POST', '/api/v1/transactions', transaction_input, expected=202)
transaction = requested['data']['transaction']
approval = requested['data']['approval']
assert transaction['status'] == 'CREATED' and approval['status'] == 'REQUESTED'
assert transaction['currency'] == 'NGN'
replayed = call('POST', '/api/v1/transactions', transaction_input, expected=202)
assert replayed['data']['transaction']['id'] == transaction['id']
assert replayed['data']['approval']['id'] == approval['id']
self_decision = call('POST', f"/api/v1/approvals/{approval['id']}/decision", {
    'decision': 'APPROVED', 'reason': 'Self approval must fail.'
}, headers={'x-ase-role': 'APPROVER'}, expected=403)
assert self_decision['error']['code'] == 'AUTHORIZATION_DENIED'
approved = call('POST', f"/api/v1/approvals/{approval['id']}/decision", {
    'decision': 'APPROVED', 'reason': 'Independent smoke verification.'
}, headers={'x-ase-role': 'APPROVER', 'x-ase-actor-id': 'actor_approver'}, expected=200)
assert approved['data']['approval']['status'] == 'APPROVED'
assert approved['data']['transaction']['status'] == 'AUTHORIZED'

command_correlation = f'corr-command-{run_id}'
text_run = call('POST', '/api/v1/agent/commands', {
    'text': 'Run this workflow now', 'modality': 'TEXT', 'workflowId': workflow_id
}, headers={'x-correlation-id': command_correlation}, expected=202)
assert text_run['data']['proposalOnly'] is True
assert text_run['data']['command']['intent'] == 'run_workflow'
assert text_run['data']['command']['requiresConfirmation'] is True
assert text_run['data']['command']['status'] == 'PROPOSED'
assert text_run['data']['command']['correlationId'] == command_correlation
correlated_run = call('POST', f'/api/v1/workflows/{workflow_id}/executions', {
    'input': {'commandId': text_run['data']['command']['id'], 'commandSource': 'agent-command'},
    'maxDurationMs': 5_000, 'maxCostMinor': 100,
}, headers={'x-correlation-id': command_correlation}, expected=202)
assert correlated_run['data']['execution']['correlationId'] == command_correlation
assert correlated_run['data']['execution']['status'] == 'COMPLETED'
voice_edit = call('POST', '/api/v1/voice/commands', {
    'transcript': 'Add an approval node after vendor verification', 'workflowId': workflow_id
}, expected=202)
assert voice_edit['data']['proposalOnly'] is True
assert voice_edit['data']['command']['modality'] == 'VOICE_TRANSCRIPT'
assert voice_edit['data']['command']['intent'] == 'add_node'
assert voice_edit['data']['command']['requiresConfirmation'] is False
assert voice_edit['data']['compatibilityEndpoint'] is True
malformed_command = call('POST', '/api/v1/agent/commands', b'{', expected=422, raw=True)
assert malformed_command['error']['code'] == 'VALIDATION_ERROR'
forbidden_command = call('POST', '/api/v1/agent/commands', {
    'text': 'Add an approval node', 'modality': 'TEXT'
}, headers={'x-ase-role': 'VIEWER'}, expected=403)
assert forbidden_command['error']['code'] == 'AUTHORIZATION_DENIED'

# Canvas-shaped canonical graph stops before the consequential transaction node.
canvas_id = f'workflow_canvas_{run_id}'
canvas_nodes = [
    ('start', 'trigger', 'New vendor request'),
    ('voice', 'voice_command', 'Extract voice intent'),
    ('lookup', 'tool', 'Vendor lookup'),
    ('condition', 'condition', 'Risk score gateway'),
    ('po', 'transaction', 'Purchase order approval'),
    ('end', 'action', 'Notify requester'),
]
canvas_workflow = {
    'id': canvas_id,
    'name': 'Canvas-shaped approval smoke',
    'description': 'Canonical graph shaped like the visual canvas.',
    'status': 'READY',
    'version': 1,
    'nodes': [
        {'id': node_id, 'type': node_type, 'label': label,
         'configuration': {'executionMode': 'demo'},
         'retryPolicy': {'maxRetries': 0, 'backoffMs': 0}, 'metadata': {}}
        for node_id, node_type, label in canvas_nodes
    ],
    'edges': [
        {'id': f'edge_{source}_{target}', 'source': source, 'target': target, 'metadata': {}}
        for source, target in zip(
            ['start', 'voice', 'lookup', 'condition', 'po'],
            ['voice', 'lookup', 'condition', 'po', 'end'],
        )
    ],
    'metadata': {'source': 'react-flow-canvas-smoke'},
}
canvas_saved = call('POST', '/api/v1/workflows', canvas_workflow, expected=201)
assert canvas_saved['data']['workflow']['id'] == canvas_id
canvas_run = call('POST', f'/api/v1/workflows/{canvas_id}/executions', {
    'input': {'region': 'West Africa'}, 'maxDurationMs': 5_000, 'maxCostMinor': 100
}, expected=202)
assert canvas_run['data']['execution']['status'] == 'WAITING_APPROVAL'
assert canvas_run['data']['execution']['nodeResults'][-1]['nodeId'] == 'po'
assert canvas_run['data']['execution']['nodeResults'][-1]['status'] == 'WAITING_APPROVAL'
assert len(canvas_run['data']['evidence']) == 4
assert len(canonical_results) == 22

# Legacy routes expose samples or fail closed; none fabricates persistence or media evidence.
legacy_vendor = call('GET', '/api/vendors', expected=200, group=legacy_results)
assert legacy_vendor['demo'] is True and legacy_vendor['persistence'] == 'none'
assert legacy_vendor['warning']
legacy_vendor_write = call('POST', '/api/vendors', {
    'name': 'Smoke Vendor', 'category': 'LOGISTICS'
}, expected=501, group=legacy_results)
assert legacy_vendor_write['error']['code'] == 'NOT_IMPLEMENTED'
invalid_synthesis = call('POST', '/api/voice/synthesize', {}, expected=422, group=legacy_results)
assert invalid_synthesis['error']['code'] == 'VALIDATION_ERROR'
closed_synthesis = call('POST', '/api/voice/synthesize', {
    'text': 'This must not produce fabricated audio.'
}, expected=501, group=legacy_results)
assert closed_synthesis['error']['code'] == 'NOT_IMPLEMENTED'
missing_audio = call(
    'POST', '/api/voice/transcribe', b'',
    headers={'content-type': 'multipart/form-data; boundary=ase-empty'},
    expected=422, group=legacy_results, raw=True,
)
assert missing_audio['error']['code'] == 'VALIDATION_ERROR'
boundary = f'ase-{run_id}'
multipart = (
    f'--{boundary}\r\n'
    'Content-Disposition: form-data; name="audio"; filename="sample.wav"\r\n'
    'Content-Type: audio/wav\r\n\r\n'
).encode() + b'RIFFdemo-audio' + f'\r\n--{boundary}--\r\n'.encode()
closed_transcription = call(
    'POST', '/api/voice/transcribe', multipart,
    headers={'content-type': f'multipart/form-data; boundary={boundary}'},
    expected=501, group=legacy_results, raw=True,
)
assert closed_transcription['error']['code'] == 'NOT_IMPLEMENTED'

print(json.dumps({
    'canonical': {'passed': len(canonical_results), 'checks': canonical_results},
    'legacy_fail_closed': {'passed': len(legacy_results), 'checks': legacy_results},
}, indent=2))
