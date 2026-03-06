# On the server side (destination)
iperf3 -s -p 5201 -i 1 -f m > /tmp/iperf-server-baseline.log

# On the client side (source)
iperf3 -c <server_ip> -p 5201 -t 30 -i 1 -f m -P 4 > /tmp/iperf-client-baseline.log 