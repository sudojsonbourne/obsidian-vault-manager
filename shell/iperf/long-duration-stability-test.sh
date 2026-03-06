# Extended test (1 hour) to verify stability
iperf3 -c <server_ip> -p 5201 -t 3600 -i 10 -f m --logfile /tmp/iperf_stability.log

# Monitor in real-time
tail -f /tmp/iperf_stability.log | while read line; do
    if echo $line | grep -q "0.00-*.* sec.*0.00 Bytes"; then
        echo "⚠️  WARNING: Transfer stalled at $(date)"
    fi
done