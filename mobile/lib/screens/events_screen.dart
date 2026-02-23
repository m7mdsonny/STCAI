// RiskIntel - Events list (alerts).
import 'package:flutter/material.dart';

class EventsScreen extends StatelessWidget {
  const EventsScreen({
    super.key,
    required this.events,
    required this.onAck,
    required this.onEscalate,
    required this.onRefresh,
  });

  final List<dynamic> events;
  final void Function(String eventId) onAck;
  final void Function(String eventId) onEscalate;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Events'),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: onRefresh)],
      ),
      body: events.isEmpty
          ? const Center(child: Text('No events'))
          : RefreshIndicator(
              onRefresh: () async => onRefresh(),
              child: ListView.builder(
                itemCount: events.length,
                itemBuilder: (context, i) {
                  final e = events[i] as Map<String, dynamic>;
                  final id = e['id'] as String? ?? '';
                  final type = e['type'] as String? ?? 'event';
                  final priority = e['priority'] as String? ?? 'medium';
                  final riskScore = e['risk_score'] != null ? (e['risk_score'] as num).toDouble() : null;
                  final occurredAt = e['occurred_at'] as String? ?? '';
                  final acked = e['acknowledged_at'] != null;
                  return Card(
                    margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                    color: _priorityColor(priority).withOpacity(0.1),
                    child: ListTile(
                      leading: Icon(_typeIcon(type), color: _priorityColor(priority)),
                      title: Text('$type • $priority'),
                      subtitle: Text('${riskScore != null ? '${riskScore.toInt()} risk • ' : ''}$occurredAt${acked ? ' • Acknowledged' : ''}'),
                      trailing: acked
                          ? null
                          : Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                IconButton(icon: const Icon(Icons.check), onPressed: () => onAck(id), tooltip: 'Acknowledge'),
                                IconButton(icon: const Icon(Icons.arrow_upward), onPressed: () => onEscalate(id), tooltip: 'Escalate'),
                              ],
                            ),
                    ),
                  );
                },
              ),
            ),
    );
  }

  Color _priorityColor(String p) {
    switch (p) {
      case 'critical': return Colors.red;
      case 'high': return Colors.orange;
      case 'medium': return Colors.amber;
      default: return Colors.grey;
    }
  }

  IconData _typeIcon(String type) {
    if (type.contains('fire') || type.contains('smoke')) return Icons.local_fire_department;
    if (type.contains('intrusion') || type.contains('theft')) return Icons.warning_amber;
    return Icons.notifications;
  }
}
