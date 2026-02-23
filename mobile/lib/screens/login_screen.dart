// RiskIntel - OTP Login flow.
import 'package:flutter/material.dart';

enum LoginStep { phone, otp }

class LoginScreen extends StatefulWidget {
  const LoginScreen({
    super.key,
    required this.onSendOtp,
    required this.onVerifyOtp,
    required this.onSuccess,
  });

  final Future<void> Function(String phone) onSendOtp;
  final Future<void> Function(String phone, String code) onVerifyOtp;
  final VoidCallback onSuccess;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phoneController = TextEditingController();
  final _otpController = TextEditingController();
  LoginStep _step = LoginStep.phone;
  bool _loading = false;
  String _error = '';

  Future<void> _sendOtp() async {
    final phone = _phoneController.text.trim();
    if (phone.isEmpty) {
      setState(() => _error = 'Enter phone number');
      return;
    }
    setState(() { _loading = true; _error = ''; });
    try {
      await widget.onSendOtp(phone);
      setState(() { _step = LoginStep.otp; _loading = false; _error = ''; });
    } catch (e) {
      final msg = e.toString().replaceFirst(RegExp(r'^DioException[^:]*:?\s*'), '').trim();
      setState(() { _error = msg; _loading = false; });
    }
  }

  Future<void> _verifyOtp() async {
    final phone = _phoneController.text.trim();
    final code = _otpController.text.trim();
    if (code.isEmpty) {
      setState(() => _error = 'Enter OTP code');
      return;
    }
    setState(() { _loading = true; _error = ''; });
    try {
      await widget.onVerifyOtp(phone, code);
      widget.onSuccess();
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      final msg = e.toString().replaceFirst(RegExp(r'^DioException[^:]*:?\s*'), '').trim();
      setState(() { _error = msg; _loading = false; });
    }
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _otpController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Login')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: _step == LoginStep.phone ? _buildPhoneStep() : _buildOtpStep(),
      ),
    );
  }

  Widget _buildPhoneStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Text('Enter your phone number', style: TextStyle(fontSize: 18)),
        Text('Demo: +201012345678 then OTP 1234', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
        const SizedBox(height: 16),
        TextField(
          controller: _phoneController,
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(
            labelText: 'Phone',
            hintText: '+201012345678',
            border: OutlineInputBorder(),
          ),
        ),
        if (_error.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(_error, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
        const SizedBox(height: 24),
        FilledButton(
          onPressed: _loading ? null : _sendOtp,
          child: _loading ? const SizedBox(height: 24, width: 24, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Send OTP'),
        ),
      ],
    );
  }

  Widget _buildOtpStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text('Code sent to ${_phoneController.text}', style: const TextStyle(fontSize: 16)),
        const SizedBox(height: 16),
        TextField(
          controller: _otpController,
          keyboardType: TextInputType.number,
          maxLength: 8,
          decoration: const InputDecoration(
            labelText: 'OTP Code',
            border: OutlineInputBorder(),
          ),
        ),
        if (_error.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(_error, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
        const SizedBox(height: 24),
        FilledButton(
          onPressed: _loading ? null : _verifyOtp,
          child: _loading ? const SizedBox(height: 24, width: 24, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Verify & Login'),
        ),
        TextButton(
          onPressed: () => setState(() { _step = LoginStep.phone; _error = ''; }),
          child: const Text('Change number'),
        ),
      ],
    );
  }
}
