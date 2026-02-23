// RiskIntel - Sites list and actions (arm/disarm, siren).
import 'package:flutter/material.dart';

class SitesScreen extends StatelessWidget {
  const SitesScreen({
    super.key,
    required this.sites,
    required this.onArm,
    required this.onDisarm,
    required this.onSiren,
    required this.onTapEvent,
    required this.onRefresh,
  });

  final List<dynamic> sites;
  final void Function(String siteId) onArm;
  final void Function(String siteId) onDisarm;
  final void Function(String siteId) onSiren;
  final VoidCallback onTapEvent;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Sites'),
        actions: [
          IconButton(icon: const Icon(Icons.list_alt), onPressed: onTapEvent),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: onRefresh,
        child: sites.isEmpty
            ? const SingleChildScrollView(physics: AlwaysScrollableScrollPhysics(), child: SizedBox(height: 200, child: Center(child: Text('No sites'))))
            : ListView.builder(
              itemCount: sites.length,
              itemBuilder: (context, i) {
                final s = sites[i] as Map<String, dynamic>;
                final id = s['id'] as String? ?? '';
                final name = s['name'] as String? ?? 'Site';
                final armed = s['armed'] as bool? ?? false;
                final deviceCount = s['device_count'] as int? ?? 0;
                return Card(
                  margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: ListTile(
                    title: Text(name),
                    subtitle: Text(armed ? 'Armed • $deviceCount device(s)' : 'Disarmed • $deviceCount device(s)'),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(armed ? Icons.lock : Icons.lock_open, color: armed ? Colors.green : Colors.grey),
                        const SizedBox(width: 8),
                        IconButton(
                          icon: const Icon(Icons.notifications_active),
                          onPressed: () => onSiren(id),
                          tooltip: 'Trigger siren',
                        ),
                      ],
                    ),
                    onTap: () => _showSiteActions(context, id, name, armed),
                  ),
                );
              },
            ),
      ),
    );
  }

  void _showSiteActions(BuildContext context, String id, String name, bool armed) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(title: Text(name), subtitle: Text(id)),
            ListTile(
              leading: Icon(armed ? Icons.lock_open : Icons.lock),
              title: Text(armed ? 'Disarm' : 'Arm'),
              onTap: () {
                Navigator.pop(ctx);
                if (armed) onDisarm(id); else onArm(id);
              },
            ),
            ListTile(
              leading: const Icon(Icons.notifications_active),
              title: const Text('Trigger siren'),
              onTap: () {
                Navigator.pop(ctx);
                onSiren(id);
              },
            ),
          ],
        ),
      ),
    );
  }
}
