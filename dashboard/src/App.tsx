import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit';
import { Shield, Coins, Activity, Code2 } from 'lucide-react';

function App() {
  const account = useCurrentAccount();

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      {/* Header */}
      <nav className="border-b border-white/10 px-6 py-4 flex justify-between items-center backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Shield className="w-6 h-6" />
          </div>
          <span className="text-xl font-bold tracking-tight">Davy Suifi</span>
        </div>

        <div className="flex items-center gap-4">
          <ConnectButton />
        </div>
      </nav>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-7xl font-extrabold mb-6 bg-gradient-to-r from-blue-400 to-indigo-600 bg-clip-text text-transparent">
            Secure Agentic Finance on Sui
          </h1>
          <p className="text-gray-400 text-xl max-w-2xl mx-auto">
            The next generation of autonomous yield optimization and risk management powered by Sui Move.
          </p>
        </div>

        {/* Dashboard Preview / Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <StatCard
            icon={<Coins className="w-5 h-5 text-blue-400" />}
            label="Total Value Locked"
            value="$0.00"
          />
          <StatCard
            icon={<Activity className="w-5 h-5 text-green-400" />}
            label="Active Agents"
            value="0"
          />
          <StatCard
            icon={<Code2 className="w-5 h-5 text-purple-400" />}
            label="Audit Score"
            value="N/A"
          />
        </div>

        {/* Account Info */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-sm">
          <h2 className="text-2xl font-bold mb-4">Account Status</h2>
          {account ? (
            <div className="space-y-2">
              <p className="text-gray-400">Connected Wallet:</p>
              <code className="bg-black/40 px-3 py-1 rounded text-blue-400 break-all">
                {account.address}
              </code>
            </div>
          ) : (
            <p className="text-gray-400">Please connect your wallet to view account details and active agents.</p>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-10 text-center text-gray-500">
        <p>© 2026 Davy Suifi. Built on Sui.</p>
      </footer>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  return (
    <div className="bg-white/5 border border-white/10 p-6 rounded-2xl hover:bg-white/10 transition-colors">
      <div className="flex items-center gap-3 mb-4">
        {icon}
        <span className="text-sm text-gray-400 font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}

export default App;
