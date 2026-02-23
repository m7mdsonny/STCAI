// RiskIntel - Settings: API URL, Logout.
import 'package:flutter/material.dart';
import '../api/client.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({
    super.key,
    required this.api,
    required this.currentBaseUrl,
    required this.onSaveBaseUrl,
    required this.onLogout,
  });

  final RiskIntelApiClient api;
  final String currentBaseUrl;
  final Future<void> Function(String url) onSaveBaseUrl;
  final VoidCallback onLogout;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late TextEditingController _urlController;
  bool _saving = false;
  String? _message;

  @override
  void initState() {
    super.initState();
    _urlController = TextEditingController(text: widget.currentBaseUrl);
  }

  @override
  void dispose() {
    _urlController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final url = _urlController.text.trim();
    if (url.isEmpty) {
      setState(() => _message = 'Enter API base URL');
      return;
    }
    setState(() { _saving = true; _message = null; });
    try {
      await widget.onSaveBaseUrl(url);
      if (mounted) setState(() { _saving = false; _message = 'Saved. New requests will use this URL.'; });
    } catch (e) {
      if (mounted) setState(() { _saving = false; _message = e.toString(); });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const Text('API base URL', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
          const SizedBox(height: 8),
          TextField(
            controller: _urlController,
            decoration: const InputDecoration(
              hintText: 'http://localhost:8080',
              border: OutlineInputBorder(),
              isDense: true,
            ),
            keyboardType: TextInputType.url,
            autocorrect: false,
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _saving ? null : _save,
            child: _saving ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Save'),
          ),
          if (_message != null) ...[
            const SizedBox(height: 12),
            Text(_message!, style: TextStyle(color: _message!.startsWith('Saved') ? Colors.green : Theme.of(context).colorScheme.error, fontSize: 14)),
          ],
          const SizedBox(height: 32),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.logout),
            title: const Text('Log out'),
            onTap: () {
              widget.onLogout();
              if (context.mounted) Navigator.of(context).popUntil((r) => r.isFirst);
            },
          ),
        ],
      ),
    );
  }
}
